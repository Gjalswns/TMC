"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";
import {
  generateTargetNumbers,
  validateYearGameAttempt,
  calculateScore,
  type YearGameConfig,
} from "./year-game-utils";

/**
 * Create a new Year Game session
 */
export async function createYearGameSession(
  gameId: string,
  roundNumber: number,
  timeLimit: number = 180
) {
  try {
    // Check if session already exists for this game and round
    const { data: existingSession } = await supabase
      .from("year_game_sessions")
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

    const targetNumbers = generateTargetNumbers();

    const { data: session, error } = await supabase
      .from("year_game_sessions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        target_numbers: targetNumbers,
        time_limit_seconds: timeLimit,
        status: "waiting",
      })
      .select()
      .single();

    if (error) throw error;

    // Initialize results for all teams
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id")
      .eq("game_id", gameId);

    if (teamsError) {
      console.error("Error fetching teams:", teamsError);
      // Continue anyway, results can be created later
    }

    if (teams && teams.length > 0) {
      const results = teams.map((team) => ({
        session_id: session.id,
        team_id: team.id,
        numbers_found: [],
        total_found: 0,
        score: 0,
      }));

      const { error: resultsError } = await supabase
        .from("year_game_results")
        .insert(results);

      if (resultsError) {
        console.error("Error creating team results:", resultsError);
        // Continue anyway, results can be created later
      }
    }

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true, session, targetNumbers };
  } catch (error) {
    console.error("Error creating Year Game session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to create session",
    };
  }
}

/**
 * Start a Year Game session
 */
export async function startYearGameSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from("year_game_sessions")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Error starting Year Game session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to start session",
    };
  }
}

/**
 * End a Year Game session
 */
export async function endYearGameSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from("year_game_sessions")
      .update({
        status: "finished",
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Error ending Year Game session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to end session",
    };
  }
}

/**
 * Submit a Year Game attempt (with race condition protection)
 */
export async function submitYearGameAttempt(
  sessionId: string,
  teamId: string,
  participantId: string,
  expression: string,
  targetNumber: number
) {
  try {
    console.log(`🎯 Submitting Year Game attempt: team=${teamId}, target=${targetNumber}`);
    
    // Get session data to validate
    const { data: session, error: sessionError } = await supabase
      .from("year_game_sessions")
      .select("target_numbers, status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error("❌ Session not found:", sessionError);
      return { success: false, error: "Session not found" };
    }

    if (session.status !== "active") {
      console.warn("⚠️ Session is not active:", session.status);
      return { success: false, error: "Session is not active" };
    }

    // Validate the attempt on client side
    const { data: teamResult } = await supabase
      .from("year_game_results")
      .select("numbers_found")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    const alreadyFound = teamResult?.numbers_found || [];
    const attempt = validateYearGameAttempt(
      expression,
      session.target_numbers,
      targetNumber,
      alreadyFound
    );

    if (!attempt.isValid) {
      console.warn("⚠️ Invalid attempt:", attempt.error);
      return {
        success: false,
        error: attempt.error || "Invalid expression",
      };
    }

    // Use atomic database function to prevent race conditions
    const { data: result, error: rpcError } = await supabase.rpc(
      "submit_year_game_attempt_safe",
      {
        p_session_id: sessionId,
        p_team_id: teamId,
        p_participant_id: participantId,
        p_expression: expression,
        p_target_number: targetNumber,
        p_is_valid: attempt.isValid,
        p_is_correct: attempt.isCorrect,
      }
    );

    if (rpcError) {
      console.error("❌ RPC error:", rpcError);
      throw rpcError;
    }

    if (!result.success) {
      console.error("❌ Attempt failed:", result.error);
      return { success: false, error: result.error };
    }

    console.log(`✅ Attempt submitted successfully: duplicate=${result.is_duplicate}`);
    
    revalidatePath("/admin");
    return {
      success: true,
      attempt: {
        isValid: attempt.isValid,
        isCorrect: attempt.isCorrect,
        isDuplicate: result.is_duplicate,
        error: result.is_duplicate ? "Number already found" : null,
      },
      isNewNumber: attempt.isCorrect && !result.is_duplicate,
      newScore: result.new_score,
    };
  } catch (error) {
    console.error("❌ Error submitting Year Game attempt:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to submit attempt",
    };
  }
}

/**
 * Get Year Game session data
 */
export async function getYearGameSession(sessionId: string) {
  try {
    const { data: session, error } = await supabase
      .from("year_game_sessions")
      .select(
        `
        *,
        year_game_results (
          *,
          teams (
            id,
            team_name,
            team_number,
            score
          )
        )
      `
      )
      .eq("id", sessionId)
      .single();

    if (error) throw error;

    return { success: true, session };
  } catch (error) {
    console.error("Error getting Year Game session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get session",
    };
  }
}

/**
 * Get active Year Game session for a game
 */
export async function getActiveYearGameSession(gameId: string) {
  try {
    const { data: session, error } = await supabase
      .from("year_game_sessions")
      .select(
        `
        *,
        year_game_results (
          *,
          teams (
            id,
            team_name,
            team_number,
            score
          )
        )
      `
      )
      .eq("game_id", gameId)
      .eq("status", "active")
      .single();

    if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows found

    return { success: true, session: session || null };
  } catch (error) {
    console.error("Error getting active Year Game session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get active session",
    };
  }
}

/**
 * Get Year Game results for a team
 */
export async function getYearGameTeamResults(
  sessionId: string,
  teamId: string
) {
  try {
    const { data: result, error } = await supabase
      .from("year_game_results")
      .select("*")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return { success: true, result: result || null };
  } catch (error) {
    console.error("Error getting Year Game team results:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get team results",
    };
  }
}

/**
 * Get recent attempts for a team
 */
export async function getYearGameTeamAttempts(
  sessionId: string,
  teamId: string,
  limit: number = 10
) {
  try {
    const { data: attempts, error } = await supabase
      .from("year_game_attempts")
      .select(
        `
        *,
        participants (
          nickname
        )
      `
      )
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .order("submitted_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { success: true, attempts: attempts || [] };
  } catch (error) {
    console.error("Error getting Year Game team attempts:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get team attempts",
    };
  }
}
