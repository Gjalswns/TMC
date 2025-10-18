"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";

/**
 * Create a new Score Steal Game session
 */
export async function createScoreStealSession(
  gameId: string,
  roundNumber: number
) {
  try {
    // Check if session already exists for this game and round
    const { data: existingSession } = await supabase
      .from("score_steal_sessions")
      .select("id")
      .eq("game_id", gameId)
      .eq("round_number", roundNumber)
      .single();

    if (existingSession) {
      return {
        success: false,
        error: "Session already exists for this game and round",
      };
    }

    const { data: session, error } = await supabase
      .from("score_steal_sessions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        status: "waiting",
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true, session };
  } catch (error) {
    console.error("Error creating Score Steal session:", error);
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
