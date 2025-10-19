"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";

// Types for new realtime competition mode
interface ProtectedTeam {
  team_id: string;
  team_name: string;
  reason: string;
}

/**
 * Create and start a new Score Steal realtime session
 */
export async function createScoreStealSession(
  gameId: string,
  roundNumber: number
) {
  try {
    console.log(`🎮 Creating Score Steal realtime session for game ${gameId}, round ${roundNumber}`);

    // 새로운 데이터베이스 함수 호출
    const { data, error } = await supabase.rpc('start_score_steal_realtime_session', {
      p_game_id: gameId,
      p_round_number: roundNumber
    });

    if (error) throw error;

    const result = data?.[0];
    if (!result?.success) {
      throw new Error(result?.message || 'Failed to create session');
    }

    console.log(`✅ Score Steal realtime session created: ${result.session_id}`);
    
    revalidatePath(`/admin/game/${gameId}`);
    return { 
      success: true, 
      sessionId: result.session_id,
      message: result.message
    };
  } catch (error) {
    console.error("❌ Error creating Score Steal session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to create session",
    };
  }
}

/**
 * Start a Score Steal Game session
 */
export async function startScoreStealSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from("score_steal_sessions")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Error starting Score Steal session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to start session",
    };
  }
}

/**
 * End a Score Steal Game session
 */
export async function endScoreStealSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from("score_steal_sessions")
      .update({
        status: "finished",
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Error ending Score Steal session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to end session",
    };
  }
}

/**
 * Create a new Score Steal question
 */
export async function createScoreStealQuestion(
  gameId: string,
  roundNumber: number,
  questionText: string,
  correctAnswer: string,
  difficulty: "easy" | "medium" | "hard"
) {
  try {
    const points =
      difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30;

    const { data: question, error } = await supabase
      .from("score_steal_questions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        question_text: questionText,
        correct_answer: correctAnswer,
        difficulty,
        points,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true, question };
  } catch (error) {
    console.error("Error creating Score Steal question:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to create question",
    };
  }
}

/**
 * Submit a Score Steal attempt (with race condition protection)
 */
export async function submitScoreStealAttempt(
  gameId: string,
  roundNumber: number,
  teamId: string,
  questionId: string,
  targetTeamId: string,
  answer: string
) {
  try {
    console.log(`🎯 Score Steal attempt: team=${teamId} -> target=${targetTeamId}`);
    
    // Get question data
    const { data: question, error: questionError } = await supabase
      .from("score_steal_questions")
      .select("correct_answer, points")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      console.error("❌ Question not found:", questionError);
      return { success: false, error: "Question not found" };
    }

    // Use atomic database function to handle score transfer
    // This prevents deadlocks and ensures consistent score updates
    const { data: result, error: rpcError } = await supabase.rpc(
      "submit_score_steal_attempt_safe",
      {
        p_game_id: gameId,
        p_round_number: roundNumber,
        p_team_id: teamId,
        p_question_id: questionId,
        p_target_team_id: targetTeamId,
        p_answer: answer,
        p_correct_answer: question.correct_answer,
        p_points: question.points,
      }
    );

    if (rpcError) {
      console.error("❌ RPC error:", rpcError);
      throw rpcError;
    }

    if (!result.success) {
      console.warn("⚠️ Score Steal attempt failed:", result.error);
      return { success: false, error: result.error };
    }

    console.log(`✅ Score Steal completed: correct=${result.is_correct}, ` +
      `attacking_score=${result.attacking_team_score}, target_score=${result.target_team_score}`);

    revalidatePath("/admin");
    return {
      success: true,
      isCorrect: result.is_correct,
      pointsGained: result.points_gained,
      pointsLost: result.points_lost,
      attackingTeamScore: result.attacking_team_score,
      targetTeamScore: result.target_team_score,
    };
  } catch (error) {
    console.error("❌ Error submitting Score Steal attempt:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to submit attempt",
    };
  }
}

/**
 * Get available target teams with their current scores
 */
export async function getAvailableTargets(gameId: string) {
  try {
    const { data: teams, error } = await supabase
      .from("teams")
      .select("id, team_name, team_number, score")
      .eq("game_id", gameId)
      .order("score", { ascending: false });

    if (error) throw error;

    return { success: true, teams: teams || [] };
  } catch (error) {
    console.error("Error getting available targets:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get targets",
    };
  }
}

/**
 * Get Score Steal session data
 */
export async function getScoreStealSession(sessionId: string) {
  try {
    const { data: session, error } = await supabase
      .from("score_steal_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error) throw error;

    return { success: true, session };
  } catch (error) {
    console.error("Error getting Score Steal session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get session",
    };
  }
}

/**
 * Get Score Steal questions for a game and round
 */
export async function getScoreStealQuestions(
  gameId: string,
  roundNumber: number
) {
  try {
    const { data: questions, error } = await supabase
      .from("score_steal_questions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", roundNumber)
      .order("difficulty", { ascending: true });

    if (error) throw error;

    return { success: true, questions: questions || [] };
  } catch (error) {
    console.error("Error getting Score Steal questions:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get questions",
    };
  }
}

/**
 * Get Score Steal attempts for a game
 */
export async function getScoreStealAttempts(
  gameId: string,
  roundNumber: number
) {
  try {
    const { data: attempts, error } = await supabase
      .from("score_steal_attempts")
      .select(
        `
        *,
        teams!score_steal_attempts_team_id_fkey(team_name, team_number),
        teams!score_steal_attempts_target_team_id_fkey(team_name, team_number),
        score_steal_questions(question_text, difficulty, points)
      `
      )
      .eq("game_id", gameId)
      .eq("round_number", roundNumber)
      .order("submitted_at", { ascending: false });

    if (error) throw error;

    return { success: true, attempts: attempts || [] };
  } catch (error) {
    console.error("Error getting Score Steal attempts:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get attempts",
    };
  }
}

/**
 * Broadcast question to all teams (새로운 실시간 시스템)
 */
export async function broadcastQuestion(
  sessionId: string,
  questionId: string
) {
  try {
    console.log(`📡 Broadcasting question ${questionId} to session ${sessionId}`);

    const { data, error } = await supabase.rpc("broadcast_score_steal_question", {
      p_session_id: sessionId,
      p_question_id: questionId,
    });

    if (error) throw error;

    const result = data?.[0];
    if (!result?.success) {
      throw new Error(result?.message || 'Failed to broadcast question');
    }

    console.log(`✅ Question broadcasted at: ${result.broadcast_at}`);

    revalidatePath("/admin");
    return {
      success: true,
      broadcastAt: result.broadcast_at,
      message: result.message
    };
  } catch (error) {
    console.error("❌ Error broadcasting question:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to broadcast question",
    };
  }
}

/**
 * Submit answer in realtime race mode (새로운 실시간 시스템)
 */
export async function submitAnswerForRace(
  sessionId: string,
  teamId: string,
  answer: string,
  broadcastTime: string
) {
  try {
    console.log(`🏁 Realtime answer submission: team=${teamId}, answer="${answer}"`);

    const { data, error } = await supabase.rpc("submit_score_steal_answer_realtime", {
      p_session_id: sessionId,
      p_team_id: teamId,
      p_answer: answer,
      p_broadcast_time: broadcastTime,
    });

    if (error) throw error;

    const result = data?.[0];
    if (!result?.success) {
      console.warn("⚠️ Answer submission failed:", result?.message);
      return { success: false, error: result?.message || 'Failed to submit answer' };
    }

    console.log(`✅ Answer submitted: correct=${result.is_correct}, winner=${result.is_winner}, time=${result.response_time_ms}ms`);

    revalidatePath("/game");
    return {
      success: true,
      attemptId: result.attempt_id,
      isCorrect: result.is_correct,
      isWinner: result.is_winner,
      responseTimeMs: result.response_time_ms,
      inputShouldLock: result.input_should_lock,
      message: result.message
    };
  } catch (error) {
    console.error("❌ Error submitting answer:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to submit answer",
    };
  }
}

/**
 * Determine the winner (fastest correct answer)
 */
export async function determineWinner(sessionId: string) {
  try {
    console.log(`🏆 Determining winner for session ${sessionId}`);

    const { data, error } = await supabase.rpc("determine_round_winner", {
      p_session_id: sessionId,
    });

    if (error) throw error;

    if (!data.success) {
      console.warn("⚠️ No winner found:", data.error);
      return { success: false, error: data.error };
    }

    console.log(
      `🎉 Winner: ${data.winner_team_name} (${data.response_time_ms}ms)`
    );

    revalidatePath("/admin");
    return {
      success: true,
      winnerTeamId: data.winner_team_id,
      winnerTeamName: data.winner_team_name,
      responseTimeMs: data.response_time_ms,
    };
  } catch (error) {
    console.error("❌ Error determining winner:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to determine winner",
    };
  }
}

/**
 * Execute score steal with target selection (새로운 실시간 시스템)
 */
export async function executeScoreSteal(
  sessionId: string,
  targetTeamId: string
) {
  try {
    console.log(`💰 Executing score steal: session=${sessionId} -> target=${targetTeamId}`);

    const { data, error } = await supabase.rpc("execute_score_steal_with_target", {
      p_session_id: sessionId,
      p_target_team_id: targetTeamId,
    });

    if (error) throw error;

    const result = data?.[0];
    if (!result?.success) {
      console.warn("⚠️ Score steal failed:", result?.message);
      return { success: false, error: result?.message || 'Failed to execute score steal' };
    }

    console.log(`✅ Score steal completed: stolen=${result.points_stolen}, winner_score=${result.winner_new_score}, target_score=${result.target_new_score}`);

    revalidatePath("/admin");
    revalidatePath("/game");
    return {
      success: true,
      pointsStolen: result.points_stolen,
      winnerNewScore: result.winner_new_score,
      targetNewScore: result.target_new_score,
      message: result.message
    };
  } catch (error) {
    console.error("❌ Error executing score steal:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to execute score steal",
    };
  }
}

/**
 * Get protected teams for a round
 */
export async function getProtectedTeams(gameId: string, roundNumber: number) {
  try {
    const { data, error } = await supabase.rpc("get_protected_teams", {
      p_game_id: gameId,
      p_round_number: roundNumber,
    });

    if (error) throw error;

    return {
      success: true,
      protectedTeams: (data as ProtectedTeam[]) || [],
    };
  } catch (error) {
    console.error("Error getting protected teams:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get protected teams",
      protectedTeams: [],
    };
  }
}

/**
 * Get current session with full details
 */
export async function getScoreStealSessionDetails(sessionId: string) {
  try {
    const { data: session, error } = await supabase
      .from("score_steal_sessions")
      .select(
        `
        *,
        score_steal_questions!score_steal_sessions_current_question_id_fkey (
          id,
          question_text,
          correct_answer,
          difficulty,
          points
        ),
        teams!score_steal_sessions_winner_team_id_fkey (
          id,
          team_name,
          team_number
        )
      `
      )
      .eq("id", sessionId)
      .single();

    if (error) throw error;

    return { success: true, session };
  } catch (error) {
    console.error("Error getting session details:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get session details",
    };
  }
}

/**
 * Get all attempts for current session with team info
 */
export async function getSessionAttempts(sessionId: string) {
  try {
    const { data: attempts, error } = await supabase
      .from("score_steal_attempts")
      .select(
        `
        *,
        teams (
          id,
          team_name,
          team_number
        )
      `
      )
      .eq("session_id", sessionId)
      .order("response_time_ms", { ascending: true });

    if (error) throw error;

    return { success: true, attempts: attempts || [] };
  } catch (error) {
    console.error("Error getting session attempts:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get attempts",
      attempts: [],
    };
  }
}
