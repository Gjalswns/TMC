"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";
import {
  generateTargetNumbers,
  validateYearGameAttempt,
  calculateScore,
  type YearGameConfig,
} from "./year-game-utils";

// 재시도 로직을 위한 헬퍼 함수
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt < maxRetries) {
        // 지수 백오프를 사용한 재시도
        await new Promise(resolve => 
          setTimeout(resolve, delayMs * Math.pow(2, attempt - 1))
        );
      }
    }
  }
  
  throw lastError || new Error("Operation failed after retries");
}

/**
 * Create and start a new Year Game session (1~100 범위)
 */
export async function createYearGameSession(
  gameId: string,
  roundNumber: number,
  timeLimit: number = 600 // 10분으로 기본값 변경
) {
  try {
    console.log(`🎮 Creating Year Game session for game ${gameId}, round ${roundNumber}`);

    // 기존 활성 세션 종료
    await supabase
      .from("year_game_sessions")
      .update({ 
        status: "finished", 
        ended_at: new Date().toISOString() 
      })
      .eq("game_id", gameId)
      .eq("status", "active");

    // 새로운 데이터베이스 함수 호출
    const { data, error } = await supabase.rpc('start_year_game_session', {
      p_game_id: gameId,
      p_round_number: roundNumber,
      p_time_limit_seconds: timeLimit,
      p_target_numbers: generateTargetNumbers() // 4개 숫자 생성
    });

    if (error) throw error;

    const result = data?.[0];
    if (!result?.success) {
      throw new Error(result?.message || 'Failed to create session');
    }

    console.log(`✅ Year Game session created: ${result.session_id}`);
    
    revalidatePath(`/admin/game/${gameId}`);
    return { 
      success: true, 
      sessionId: result.session_id,
      message: result.message
    };
  } catch (error) {
    console.error("❌ Error creating Year Game session:", error);
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
    // 세션 정보 먼저 가져오기
    const { data: session, error: sessionError } = await supabase
      .from("year_game_sessions")
      .select("game_id")
      .eq("id", sessionId)
      .single();

    if (sessionError) throw sessionError;

    // 세션 상태 업데이트
    const { error } = await supabase
      .from("year_game_sessions")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    // 브로드캐스트로 즉시 알림 (여러 채널 동시 사용)
    const gameId = session.game_id;
    const broadcastData = {
      type: "year_game_started",
      sessionId,
      gameId,
      timestamp: new Date().toISOString()
    };

    // 1. 게임별 채널
    await supabase.channel(`game-${gameId}`).send({
      type: "broadcast",
      event: "year_game_started",
      payload: broadcastData
    });

    // 2. 전체 게임 채널
    await supabase.channel("games").send({
      type: "broadcast", 
      event: "year_game_started",
      payload: broadcastData
    });

    // 3. Year Game 전용 채널
    await supabase.channel(`year-game-${gameId}`).send({
      type: "broadcast",
      event: "session_started", 
      payload: broadcastData
    });

    console.log(`📡 Broadcasted Year Game start to multiple channels for game ${gameId}`);

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
 * Submit a Year Game attempt (팀 단위, 1~100 범위)
 */
export async function submitYearGameAttempt(
  sessionId: string,
  teamId: string,
  participantId: string,
  expression: string,
  targetNumber: number
) {
  try {
    console.log(`🎯 Submitting Year Game attempt: team=${teamId}, target=${targetNumber}, expr=${expression}`);
    
    // 새로운 데이터베이스 함수 호출 (원자적 처리)
    const { data, error } = await supabase.rpc('submit_year_game_team_attempt', {
      p_session_id: sessionId,
      p_team_id: teamId,
      p_participant_id: participantId,
      p_expression: expression,
      p_target_number: targetNumber
    });

    if (error) throw error;

    // JSON 응답 처리
    const result = data;
    if (!result?.success) {
      console.warn("⚠️ Attempt failed:", result?.message);
      return {
        success: false,
        error: result?.message || "Failed to submit attempt"
      };
    }

    console.log(`✅ Attempt submitted: valid=${result.is_valid}, correct=${result.is_correct}, duplicate=${result.is_duplicate}, new=${result.is_new_number}`);
    
    revalidatePath("/admin");
    return {
      success: true,
      attempt: {
        id: result.attempt_id,
        isValid: result.is_valid,
        isCorrect: result.is_correct,
        isDuplicate: result.is_duplicate,
        error: result.is_duplicate ? "Number already found by your team" : null,
      },
      isNewNumber: result.is_new_number,
      teamScore: result.team_score,
      teamTotalFound: result.team_total_found,
      message: result.message
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
