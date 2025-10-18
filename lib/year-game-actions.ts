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
 * Submit a Year Game attempt
 */
export async function submitYearGameAttempt(
  sessionId: string,
  teamId: string,
  participantId: string,
  expression: string,
  targetNumber: number
) {
  try {
    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from("year_game_sessions")
      .select("target_numbers, status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: "Session not found" };
    }

    if (session.status !== "active") {
      return { success: false, error: "Session is not active" };
    }

    // Get already found numbers for this team
    const { data: teamResult } = await supabase
      .from("year_game_results")
      .select("numbers_found")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    const alreadyFound = teamResult?.numbers_found || [];

    // Validate the attempt
    const attempt = validateYearGameAttempt(
      expression,
      session.target_numbers,
      targetNumber,
      alreadyFound
    );

    // Record the attempt
    const { error: attemptError } = await supabase
      .from("year_game_attempts")
      .insert({
        session_id: sessionId,
        team_id: teamId,
        participant_id: participantId,
        expression: expression,
        target_number: targetNumber,
        is_valid: attempt.isValid,
        is_correct: attempt.isCorrect,
        is_duplicate: attempt.isDuplicate,
      });

    if (attemptError) throw attemptError;

    // If the attempt is correct and not duplicate, update team results
    if (attempt.isCorrect && !attempt.isDuplicate) {
      const newNumbersFound = [...alreadyFound, targetNumber].sort(
        (a, b) => a - b
      );
      const newScore = calculateScore(newNumbersFound);

      const { error: updateError } = await supabase
        .from("year_game_results")
        .update({
          numbers_found: newNumbersFound,
          total_found: newNumbersFound.length,
          score: newScore,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId)
        .eq("team_id", teamId);

      if (updateError) throw updateError;

      // Update team score in teams table using RPC function for consistency
      const { error: teamScoreError } = await supabase.rpc('update_team_score', {
        team_id: teamId,
        new_score: newScore
      });

      if (teamScoreError) {
        console.error("Failed to update team score:", teamScoreError);
      }
    }

    revalidatePath("/admin");
    return {
      success: true,
      attempt,
      isNewNumber: attempt.isCorrect && !attempt.isDuplicate,
    };
  } catch (error) {
    console.error("Error submitting Year Game attempt:", error);
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
