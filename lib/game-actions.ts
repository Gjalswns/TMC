"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";

// Broadcast game events to all connected clients
async function broadcastGameEvent(gameId: string, eventType: string, data: any) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/broadcast-game-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        gameId,
        eventType,
        data
      })
    });

    if (!response.ok) {
      console.error('Failed to broadcast event:', response.statusText);
    }
  } catch (error) {
    console.error('Error broadcasting game event:', error);
  }
}
import { createYearGameSession } from "./year-game-actions";

function generateGameCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createGame(
  formData: FormData | { title: string; gameType: string; rounds: number; maxParticipants?: number; joinDeadlineMinutes?: number }
) {
  let title: string;
  let gameType: string;
  let duration: number = 60; // Fixed duration of 60 minutes
  let teamCount: number;
  let maxParticipants: number = 20;
  let joinDeadlineMinutes: number = 30;

  if (formData instanceof FormData) {
    // Legacy form data format
    title = formData.get("title") as string;
    const gradeClass = formData.get("gradeClass") as string;
    teamCount = Number.parseInt(formData.get("teamCount") as string);
    gameType = "general";
    maxParticipants = Number.parseInt(formData.get("maxParticipants") as string) || 20;
    joinDeadlineMinutes = Number.parseInt(formData.get("joinDeadlineMinutes") as string) || 30;
  } else {
    // New object format
    title = formData.title;
    gameType = formData.gameType;
    teamCount = 4; // Default team count for Year Game
    maxParticipants = formData.maxParticipants || 20;
    joinDeadlineMinutes = formData.joinDeadlineMinutes || 30;
  }

  // Validate inputs
  if (!title || title.length < 3 || title.length > 100) {
    return {
      success: false,
      error: "Title must be between 3 and 100 characters",
    };
  }

  if (teamCount < 2 || teamCount > 10) {
    return {
      success: false,
      error: "Team count must be between 2 and 10",
    };
  }

  if (maxParticipants < teamCount || maxParticipants > 100) {
    return {
      success: false,
      error: "Max participants must be at least the team count and at most 100",
    };
  }

  const gameCode = generateGameCode();

  try {
    // Create the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        title,
        grade_class: "Year Game Class", // Default for now
        duration,
        team_count: teamCount,
        game_code: gameCode,
        game_type: gameType,
        total_rounds: 4, // Default to 4 rounds (Year Game + Score Steal + 2 Relay Quiz)
        max_participants: maxParticipants,
        join_deadline_minutes: joinDeadlineMinutes,
        game_expires_at: new Date(Date.now() + duration * 60 * 1000).toISOString(), // Game expires after duration
      })
      .select()
      .single();

    if (gameError) throw gameError;

    // Create teams for the game
    const teams = Array.from({ length: teamCount }, (_, i) => ({
      game_id: game.id,
      team_name: `Team ${i + 1}`,
      team_number: i + 1,
    }));

    const { error: teamsError } = await supabase.from("teams").insert(teams);

    if (teamsError) throw teamsError;

    revalidatePath("/admin");
    
    // Broadcast game creation event
    await broadcastGameEvent(game.id, 'game-created', game);
    
    return { success: true, gameId: game.id, gameCode };
  } catch (error) {
    console.error("Error creating game:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to create game",
    };
  }
}

export async function joinGame(
  gameCode: string,
  nickname: string,
  studentId?: string
) {
  try {
    // Validate inputs
    if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 20) {
      return { 
        success: false, 
        error: "Nickname must be between 2 and 20 characters" 
      };
    }

    if (studentId && (studentId.length < 3 || studentId.length > 20)) {
      return { 
        success: false, 
        error: "Student ID must be between 3 and 20 characters" 
      };
    }

    // Find the game with full information
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, status, max_participants, join_deadline_minutes, created_at, game_expires_at")
      .eq("game_code", gameCode)
      .single();

    if (gameError || !game) {
      return { success: false, error: "Game not found" };
    }

    // Use database function to validate join
    const { data: validationResult, error: validationError } = await supabase
      .rpc('validate_participant_join', {
        p_game_id: game.id,
        p_nickname: nickname.trim(),
        p_student_id: studentId?.trim() || null
      });

    if (validationError) {
      console.error("Validation error:", validationError);
      return { success: false, error: "Failed to validate join request" };
    }

    if (!validationResult.valid) {
      return { success: false, error: validationResult.error };
    }

    // Add participant
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        game_id: game.id,
        nickname: nickname.trim(),
        student_id: studentId?.trim() || null,
      })
      .select()
      .single();

    if (participantError) {
      // Handle specific database errors
      if (participantError.code === '23505') {
        if (participantError.message.includes('unique_nickname_per_game')) {
          return { success: false, error: "Nickname already taken in this game" };
        }
        if (participantError.message.includes('unique_student_id_per_game')) {
          return { success: false, error: "Student ID already registered in this game" };
        }
      }
      throw participantError;
    }

    // Broadcast participant join event
    await broadcastGameEvent(game.id, 'participant-joined', {
      participant,
      participantCount: validationResult.participant_count + 1
    });

    return { 
      success: true, 
      gameId: game.id, 
      participantId: participant.id,
      participantCount: validationResult.participant_count + 1
    };
  } catch (error) {
    console.error("Error joining game:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to join game",
    };
  }
}

export async function assignTeams(
  gameId: string,
  assignments: { participantId: string; teamId: string }[]
) {
  try {
    const updates = assignments.map(({ participantId, teamId }) =>
      supabase
        .from("participants")
        .update({ team_id: teamId })
        .eq("id", participantId)
    );

    await Promise.all(updates);
    revalidatePath(`/admin/game/${gameId}`);
    return { success: true };
  } catch (error) {
    console.error("Error assigning teams:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to assign teams",
    };
  }
}

export async function startGame(gameId: string) {
  try {
    console.log("startGame called with gameId:", gameId);

    // Update game status to started and set current round to 1
    const { error: gameUpdateError } = await supabase
      .from("games")
      .update({
        status: "started",
        current_round: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    if (gameUpdateError) throw gameUpdateError;

    // Create Year Game session automatically
    const yearGameResult = await createYearGameSession(gameId, 1);
    if (!yearGameResult.success) {
      console.error(
        "Failed to create Year Game session:",
        yearGameResult.error
      );
      // Don't fail the entire start process, just log the error
    }

    // Ensure all teams have initial scores
    const { data: teams } = await supabase
      .from("teams")
      .select("id, score")
      .eq("game_id", gameId);

    if (teams) {
      // Reset all team scores to 0 when starting
      const { error: scoreResetError } = await supabase
        .from("teams")
        .update({ score: 0 })
        .eq("game_id", gameId);

      if (scoreResetError) {
        console.error("Failed to reset team scores:", scoreResetError);
      }
    }

    revalidatePath(`/admin/game/${gameId}`);
    revalidatePath(`/game/${gameId}/play`);
    
    // Broadcast game start event
    await broadcastGameEvent(gameId, 'game-started', {
      gameId,
      currentRound: 1,
      startedAt: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error starting game:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to start game",
    };
  }
}

export async function updateScore(teamId: string, newScore: number) {
  try {
    const { error } = await supabase
      .from("teams")
      .update({ score: newScore })
      .eq("id", teamId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error updating score:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to update score",
    };
  }
}

export async function nextRound(gameId: string) {
  try {
    // Get the current game state
    const { data: game, error: fetchError } = await supabase
      .from("games")
      .select("current_round, total_rounds")
      .eq("id", gameId)
      .single();

    if (fetchError) throw fetchError;
    if (!game) throw new Error("Game not found");

    const { current_round, total_rounds } = game;
    const nextRoundNumber = current_round + 1;

    if (nextRoundNumber > total_rounds) {
      return {
        success: false,
        error: "Game has already reached the final round",
      };
    }

    // Update game round
    const { error: updateError } = await supabase
      .from("games")
      .update({ current_round: nextRoundNumber })
      .eq("id", gameId);

    if (updateError) throw updateError;

    // Create appropriate session for the new round
    if (nextRoundNumber === 2) {
      // Create Score Steal session for round 2
      const { createScoreStealSession } = await import("./score-steal-actions");
      const scoreStealResult = await createScoreStealSession(gameId, nextRoundNumber);
      if (!scoreStealResult.success) {
        console.error("Failed to create Score Steal session:", scoreStealResult.error);
      }
    } else if (nextRoundNumber === 3 || nextRoundNumber === 4) {
      // Create Relay Quiz session for rounds 3-4
      const { createRelayQuizSession } = await import("./relay-quiz-actions");
      const relayQuizResult = await createRelayQuizSession(gameId, nextRoundNumber);
      if (!relayQuizResult.success) {
        console.error("Failed to create Relay Quiz session:", relayQuizResult.error);
      }
    }

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true, round: nextRoundNumber };
  } catch (error) {
    console.error("Error advancing round:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to advance round",
    };
  }
}

export async function updateTimeout(gameId: string, timeout: number) {
  try {
    const { error } = await supabase
      .from("games")
      .update({ round1_timeout_seconds: timeout })
      .eq("id", gameId);

    if (error) throw error;

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true };
  } catch (error) {
    console.error("Error updating timeout:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to update timeout",
    };
  }
}

/**
 * Get game information for joining
 */
export async function getGameForJoin(gameCode: string) {
  try {
    const { data: game, error } = await supabase
      .from("games")
      .select(`
        id,
        title,
        status,
        max_participants,
        join_deadline_minutes,
        created_at,
        game_expires_at,
        team_count
      `)
      .eq("game_code", gameCode)
      .single();

    if (error || !game) {
      return { success: false, error: "Game not found" };
    }

    // Check if game is joinable
    const { data: isJoinable, error: joinableError } = await supabase
      .rpc('is_game_joinable', { game_id: game.id });

    if (joinableError) {
      console.error("Error checking if game is joinable:", joinableError);
      return { success: false, error: "Failed to check game status" };
    }

    // Get current participant count
    const { count: participantCount, error: countError } = await supabase
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game.id);

    if (countError) {
      console.error("Error getting participant count:", countError);
      return { success: false, error: "Failed to get participant count" };
    }

    return {
      success: true,
      game: {
        ...game,
        isJoinable,
        currentParticipants: participantCount || 0,
        remainingSlots: game.max_participants - (participantCount || 0)
      }
    };
  } catch (error) {
    console.error("Error getting game for join:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get game information",
    };
  }
}

/**
 * Check if a participant can join a game
 */
export async function checkParticipantJoin(gameId: string, nickname: string, studentId?: string) {
  try {
    const { data: result, error } = await supabase
      .rpc('validate_participant_join', {
        p_game_id: gameId,
        p_nickname: nickname.trim(),
        p_student_id: studentId?.trim() || null
      });

    if (error) {
      console.error("Error validating participant join:", error);
      return { success: false, error: "Failed to validate join request" };
    }

    return {
      success: true,
      canJoin: result.valid,
      error: result.valid ? null : result.error,
      participantCount: result.participant_count
    };
  } catch (error) {
    console.error("Error checking participant join:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to check participant join",
    };
  }
}
