"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";

// Broadcast game events to all connected clients with improved error handling
async function broadcastGameEvent(gameId: string, eventType: string, data: any) {
  const maxRetries = 3;
  const retryDelay = 1000;

  // Skip if Edge Function URL is not configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log(`⚠️ Skipping broadcast (Edge Function not configured)`);
    return;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 Broadcasting ${eventType} (attempt ${attempt}/${maxRetries})`);
      
      // 5초 타임아웃 설정
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/broadcast-game-event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ gameId, eventType, data }),
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`✅ Broadcast successful: ${eventType}`);
        return;
      }
      
      // 4xx 에러는 재시도 안함
      if (response.status >= 400 && response.status < 500) {
        console.warn(`⚠️ Client error (${response.status}), not retrying`);
        return;
      }
      
      // 5xx 에러는 재시도
      if (attempt < maxRetries) {
        console.warn(`⚠️ Server error (${response.status}), retrying in ${retryDelay * attempt}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
    } catch (error) {
      console.error(`❌ Broadcast error (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  console.warn(`⚠️ Broadcast failed after ${maxRetries} attempts - using Realtime instead`);
}
import { createYearGameSession } from "./year-game-actions";

async function generateUniqueGameCode(): Promise<string> {
  // Use database function to generate unique code
  const { data, error } = await supabase.rpc('generate_two_digit_code');
  
  if (error) {
    console.error("Error generating game code:", error);
    throw new Error("Failed to generate game code. Please try again.");
  }
  
  if (!data) {
    throw new Error("Failed to generate game code. Please try again.");
  }
  
  return data;
}

export async function createGame(
  formData: FormData | { title: string; teamCount?: number; maxParticipants?: number; joinDeadlineMinutes?: number; usesBrackets?: boolean }
) {
  let title: string;
  let gameType: string = "tmc"; // All games are TMC format (3 rounds)
  let duration: number = 60; // Fixed duration of 60 minutes
  let teamCount: number = 4; // Default to 4 teams (will be created dynamically from preregistered players)
  let totalRounds: number = 3; // TMC games always have 3 rounds (Year Game, Score Steal, Relay Quiz)
  let maxParticipants: number = 20;
  let joinDeadlineMinutes: number = 30;
  let usesBrackets: boolean = true; // Always use brackets for TMC

  if (formData instanceof FormData) {
    // Legacy form data format
    title = formData.get("title") as string;
    teamCount = Number.parseInt(formData.get("teamCount") as string) || 4;
    maxParticipants = Number.parseInt(formData.get("maxParticipants") as string) || 20;
    joinDeadlineMinutes = Number.parseInt(formData.get("joinDeadlineMinutes") as string) || 30;
    usesBrackets = formData.get("usesBrackets") === "true";
  } else {
    // New object format
    title = formData.title;
    teamCount = formData.teamCount || 4; // Default to 4 teams
    maxParticipants = formData.maxParticipants || 20;
    joinDeadlineMinutes = formData.joinDeadlineMinutes || 30;
    usesBrackets = formData.usesBrackets !== undefined ? formData.usesBrackets : true;
  }

  // Validate inputs
  if (!title || title.length < 3 || title.length > 100) {
    return {
      success: false,
      error: "Title must be between 3 and 100 characters",
    };
  }

  if (maxParticipants < 2 || maxParticipants > 100) {
    return {
      success: false,
      error: "Max participants must be between 2 and 100",
    };
  }

  const gameCode = await generateUniqueGameCode();

  try {
    // Create the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        title,
        grade_class: "Year Game Class", // Default for now
        duration,
        team_count: teamCount,
        join_code: gameCode,
        status: "waiting",
        uses_brackets: usesBrackets,
      })
      .select()
      .single();

    if (gameError) throw gameError;

    // Get unique teams from preregistered players
    const { data: preregisteredPlayers, error: playersError } = await supabase
      .from("preregistered_players")
      .select("team_name, bracket")
      .eq("is_active", true);

    if (playersError) throw playersError;

    // Create unique teams based on preregistered players
    const uniqueTeams = new Map<string, { team_name: string; bracket: 'higher' | 'lower' }>();
    preregisteredPlayers?.forEach(player => {
      if (!uniqueTeams.has(player.team_name)) {
        uniqueTeams.set(player.team_name, {
          team_name: player.team_name,
          bracket: player.bracket
        });
      }
    });

    // Convert to array and add team numbers
    const teams = Array.from(uniqueTeams.values()).map((team, index) => ({
      game_id: game.id,
      team_name: team.team_name,
      team_number: index + 1,
      bracket: team.bracket,
    }));

    if (teams.length === 0) {
      throw new Error("No teams found in preregistered players. Please add students first.");
    }

    const { error: teamsError } = await supabase.from("teams").insert(teams);

    if (teamsError) throw teamsError;

    // Update game team_count to match actual teams created
    await supabase
      .from("games")
      .update({ team_count: teams.length })
      .eq("id", game.id);

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
    console.log(`👤 Join game request: code=${gameCode}, nickname=${nickname}`);
    
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

    // Find the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id")
      .eq("join_code", gameCode)
      .single();

    if (gameError || !game) {
      console.error("❌ Game not found:", gameError);
      return { success: false, error: "Game not found" };
    }

    // Use atomic database function to join game
    // This prevents race conditions and ensures data integrity
    const { data: result, error: joinError } = await supabase.rpc(
      "join_game_atomic",
      {
        p_game_id: game.id,
        p_nickname: nickname.trim(),
        p_student_id: studentId?.trim() || null,
      }
    );

    if (joinError) {
      console.error("❌ Join error:", joinError);
      return { success: false, error: "Failed to join game" };
    }

    if (!result.success) {
      console.warn("⚠️ Join failed:", result.error);
      return { success: false, error: result.error };
    }

    console.log(`✅ Successfully joined game: participant_id=${result.participant_id}`);

    // Broadcast participant join event
    await broadcastGameEvent(game.id, 'participant-joined', {
      participantId: result.participant_id,
      nickname: nickname.trim(),
      participantCount: result.participant_count
    });

    return { 
      success: true, 
      gameId: game.id, 
      participantId: result.participant_id,
      participantCount: result.participant_count
    };
  } catch (error) {
    console.error("❌ Error joining game:", error);
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

    // Update game status to in_progress and set current round to 1
    const { error: gameUpdateError } = await supabase
      .from("games")
      .update({
        status: "in_progress",
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

    // Year Game only - no additional sessions needed
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
        join_code,
        created_at,
        team_count
      `)
      .eq("join_code", gameCode)
      .single();

    if (error || !game) {
      return { success: false, error: "Game not found" };
    }

    // Check if game is joinable
    const { data: isJoinable, error: joinableError } = await supabase
      .rpc('is_game_joinable', { target_game_id: game.id });

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
        target_game_id: gameId,
        player_nickname: nickname.trim(),
        player_student_id: studentId?.trim() || null
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
