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
    console.log(`🎮 Creating Score Steal session for game ${gameId}, round ${roundNumber}`);

    // 직접 세션 생성
    const { data: session, error } = await supabase
      .from("score_steal_sessions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        status: "waiting",
        phase: "waiting",
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Score Steal session created: ${session.id}`);
    
    revalidatePath(`/admin/game/${gameId}`);
    return { 
      success: true, 
      sessionId: session.id,
      message: "Score Steal session created successfully"
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
 * End a Score Steal Game session and optionally advance to next round
 */
export async function endScoreStealSession(sessionId: string, advanceToNextRound: boolean = false) {
  try {
    // Get session info to find game_id
    const { data: session, error: sessionError } = await supabase
      .from("score_steal_sessions")
      .select("game_id, round_number")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error("Session not found");
    }

    // Update session status to finished
    const { error } = await supabase
      .from("score_steal_sessions")
      .update({
        status: "finished",
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    // If advanceToNextRound is true, move to next round
    if (advanceToNextRound) {
      const { data: game, error: gameError } = await supabase
        .from("games")
        .select("current_round, total_rounds")
        .eq("id", session.game_id)
        .single();

      if (gameError || !game) {
        console.error("Failed to get game info:", gameError);
      } else {
        const nextRoundNumber = game.current_round + 1;
        
        // Only advance if not at final round
        if (nextRoundNumber <= game.total_rounds) {
          const { error: updateError } = await supabase
            .from("games")
            .update({ current_round: nextRoundNumber })
            .eq("id", session.game_id);

          if (updateError) {
            console.error("Failed to advance round:", updateError);
          } else {
            console.log(`✅ Advanced to round ${nextRoundNumber}`);
            
            // Create appropriate session for the new round
            if (nextRoundNumber === 2) {
              // Create Score Steal session for round 2
              const scoreStealResult = await createScoreStealSession(session.game_id, nextRoundNumber);
              if (!scoreStealResult.success) {
                console.error("Failed to create Score Steal session:", scoreStealResult.error);
              }
            } else if (nextRoundNumber === 3 || nextRoundNumber === 4) {
              // Create Relay Quiz session for rounds 3-4
              const { createRelayQuizSession } = await import("./relay-quiz-actions");
              const relayQuizResult = await createRelayQuizSession(session.game_id, nextRoundNumber);
              if (!relayQuizResult.success) {
                console.error("Failed to create Relay Quiz session:", relayQuizResult.error);
              }
            }
          }
        }
      }
    }

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
      .select("id, team_name, team_number, score, bracket")
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
 * Broadcast question to all teams (중앙 문제 관리 시스템 사용)
 */
export async function broadcastQuestion(
  sessionId: string,
  questionId: string
) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`📡 [${timestamp}] Broadcasting central question ${questionId} to session ${sessionId}`);

    // 중앙 문제 관리에서 문제 정보 가져오기
    const { data: question, error: questionError } = await supabase
      .from('central_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      console.error(`❌ [${timestamp}] Question not found:`, questionError);
      throw new Error('Question not found in central questions');
    }

    console.log(`✅ [${timestamp}] Question found:`, {
      id: question.id,
      title: question.title,
      hasImage: !!question.question_image_url,
      imageUrl: question.question_image_url
    });

    const broadcastTime = new Date().toISOString();

    // 먼저 현재 세션 상태 확인
    const { data: currentSession } = await supabase
      .from('score_steal_sessions')
      .select('id, phase, status, current_question_id')
      .eq('id', sessionId)
      .single();

    console.log(`📊 [${timestamp}] Current session state BEFORE update:`, currentSession);

    // 세션에 현재 문제 설정 및 브로드캐스트 시간 기록
    const { data: updatedSession, error: updateError } = await supabase
      .from('score_steal_sessions')
      .update({
        current_question_id: questionId,
        question_broadcast_at: broadcastTime,
        phase: 'question_active',
        status: 'active'
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error(`❌ [${timestamp}] Session update error:`, updateError);
      throw updateError;
    }

    console.log(`✅ [${timestamp}] Session updated successfully:`, {
      sessionId: updatedSession.id,
      phase: updatedSession.phase,
      status: updatedSession.status,
      current_question_id: updatedSession.current_question_id,
      broadcast_at: updatedSession.question_broadcast_at
    });

    // 업데이트 후 다시 확인
    const { data: verifySession } = await supabase
      .from('score_steal_sessions')
      .select('id, phase, status, current_question_id, question_broadcast_at')
      .eq('id', sessionId)
      .single();

    console.log(`🔍 [${timestamp}] Verification - Session state AFTER update:`, verifySession);

    revalidatePath("/admin");
    revalidatePath("/game");
    
    return {
      success: true,
      broadcastAt: broadcastTime,
      message: 'Question broadcasted successfully'
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
 * Submit answer in realtime race mode (중앙 문제 관리 시스템 사용)
 */
export async function submitAnswerForRace(
  sessionId: string,
  teamId: string,
  answer: string,
  broadcastTime: string
) {
  try {
    console.log(`🏁 Realtime answer submission: team=${teamId}, answer="${answer}"`);

    // 새로운 중앙 문제 관리 시스템 함수 사용
    const { data, error } = await supabase.rpc('submit_score_steal_answer_central', {
      p_session_id: sessionId,
      p_team_id: teamId,
      p_answer: answer,
      p_broadcast_time: broadcastTime
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
 * Execute score steal with target selection (중앙 문제 관리 시스템 사용)
 */
export async function executeScoreSteal(
  sessionId: string,
  targetTeamId: string
) {
  try {
    console.log(`💰 Executing score steal: session=${sessionId} -> target=${targetTeamId}`);

    const { data, error } = await supabase.rpc("execute_score_steal_central", {
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
 * Get session status only (lightweight for polling)
 */
export async function getScoreStealSessionStatus(sessionId: string) {
  try {
    const { data: session, error } = await supabase
      .from("score_steal_sessions")
      .select("id, phase, status, current_question_id, question_broadcast_at, winner_team_id")
      .eq("id", sessionId)
      .single();

    if (error) throw error;

    return { success: true, session };
  } catch (error) {
    console.error("Error getting session status:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get session status",
    };
  }
}

/**
 * Get current session with full details (중앙 문제 관리 시스템 사용)
 */
export async function getScoreStealSessionDetails(sessionId: string) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`🔍 [${timestamp}] Getting session details for: ${sessionId}`);
    
    // 캐시 방지: 매번 새로운 쿼리 실행
    const { data: session, error } = await supabase
      .from("score_steal_sessions")
      .select(
        `
        *,
        teams!score_steal_sessions_winner_team_id_fkey (
          id,
          team_name,
          team_number
        )
      `
      )
      .eq("id", sessionId)
      .single();

    if (error) {
      console.error(`❌ [${timestamp}] Session query error:`, error);
      throw error;
    }

    console.log(`📊 [${timestamp}] Session data from DB:`, {
      id: session.id,
      phase: session.phase,
      status: session.status,
      current_question_id: session.current_question_id,
      question_broadcast_at: session.question_broadcast_at,
      created_at: session.created_at
    });

    // 현재 문제가 있다면 중앙 문제 관리에서 가져오기
    if (session.current_question_id) {
      console.log(`🔍 Fetching question: ${session.current_question_id}`);
      
      const { data: question, error: questionError } = await supabase
        .from('central_questions')
        .select('id, title, question_image_url, correct_answer, points')
        .eq('id', session.current_question_id)
        .single();

      if (questionError) {
        console.error('❌ Question fetch error:', questionError);
        console.error('❌ Error details:', JSON.stringify(questionError, null, 2));
      } else if (question) {
        console.log('✅ Question loaded:', {
          id: question.id,
          title: question.title,
          hasImage: !!question.question_image_url,
          imageUrl: question.question_image_url,
          points: question.points
        });
        session.score_steal_questions = question;
      } else {
        console.warn('⚠️ No question data returned');
      }
    } else {
      console.log('ℹ️ No current_question_id in session');
    }

    console.log('📦 Final session object:', {
      hasSession: !!session,
      hasQuestionData: !!session.score_steal_questions,
      questionTitle: session.score_steal_questions?.title
    });

    return { success: true, session };
  } catch (error) {
    console.error("❌ Error getting session details:", error);
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
        teams!score_steal_attempts_team_id_fkey (
          id,
          team_name,
          team_number
        ),
        target_team:teams!score_steal_attempts_target_team_id_fkey (
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
