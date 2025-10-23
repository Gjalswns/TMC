"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";

/**
 * Create a new Relay Quiz Game session
 */
export async function createRelayQuizSession(
  gameId: string,
  roundNumber: number,
  timeLimit: number = 300
) {
  try {
    // Check if session already exists for this game and round
    const { data: existingSession } = await supabase
      .from("relay_quiz_sessions")
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

    // Get questions for this round FIRST
    const { data: questions } = await supabase
      .from("relay_quiz_questions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", roundNumber)
      .order("question_order");

    console.log(`📝 [Relay Quiz] Found ${questions?.length || 0} questions for session`);

    // Prepare question data
    const questionData = questions?.map(q => ({
      id: q.id,
      question_order: q.question_order,
      question_text: q.question_text,
      correct_answer: q.correct_answer,
      points: q.points
    })) || [];

    const { data: session, error } = await supabase
      .from("relay_quiz_sessions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        time_limit_seconds: timeLimit,
        status: "waiting",
        question_data: JSON.stringify(questionData), // Store questions in session
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ [Relay Quiz] Session created with ${questionData.length} questions`);

    // Initialize team progress for all teams
    const { data: teams } = await supabase
      .from("teams")
      .select("id")
      .eq("game_id", gameId);

    if (teams && teams.length > 0) {
      const teamProgress = teams.map((team) => ({
        session_id: session.id,
        team_id: team.id,
        current_question_order: 1,
        total_questions: questions?.length || 0,
        questions_completed: 0,
        total_score: 0,
        last_participant_id: null,
      }));

      const { error: progressError } = await supabase.from("relay_quiz_team_progress").insert(teamProgress);
      
      if (progressError) {
        console.error("Error creating team progress:", progressError);
        // Continue anyway, progress can be created later
      }
    }

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true, session };
  } catch (error) {
    console.error("Error creating Relay Quiz session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to create session",
    };
  }
}

/**
 * Start a Relay Quiz Game session
 */
export async function startRelayQuizSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from("relay_quiz_sessions")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Error starting Relay Quiz session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to start session",
    };
  }
}

/**
 * End a Relay Quiz Game session and advance to next round
 */
export async function endRelayQuizSession(sessionId: string, advanceToNextRound: boolean = false) {
  try {
    // Get session info to find game_id
    const { data: session, error: sessionError } = await supabase
      .from("relay_quiz_sessions")
      .select("game_id, round_number")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error("Session not found");
    }

    // Update session status to finished
    const { error } = await supabase
      .from("relay_quiz_sessions")
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
              const { createScoreStealSession } = await import("./score-steal-actions");
              const scoreStealResult = await createScoreStealSession(session.game_id, nextRoundNumber);
              if (!scoreStealResult.success) {
                console.error("Failed to create Score Steal session:", scoreStealResult.error);
              }
            } else if (nextRoundNumber === 3 || nextRoundNumber === 4) {
              // Create Relay Quiz session for rounds 3-4
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
    console.error("Error ending Relay Quiz session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to end session",
    };
  }
}

/**
 * Create a new Relay Quiz question
 */
export async function createRelayQuizQuestion(
  gameId: string,
  roundNumber: number,
  questionOrder: number,
  questionText: string,
  correctAnswer: string,
  points: number = 10,
  timeLimitSeconds?: number
) {
  try {
    // Calculate time limit based on question order if not provided
    // Q1=3min(180s), Q2=4min(240s), Q3=5min(300s), Q4=5min(300s)
    let timeLimit = timeLimitSeconds;
    if (!timeLimit) {
      switch (questionOrder) {
        case 1:
          timeLimit = 180; // 3 minutes
          break;
        case 2:
          timeLimit = 240; // 4 minutes
          break;
        case 3:
        case 4:
          timeLimit = 300; // 5 minutes
          break;
        default:
          timeLimit = 300; // Default 5 minutes
      }
    }

    const { data: question, error } = await supabase
      .from("relay_quiz_questions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        question_order: questionOrder,
        question_text: questionText,
        correct_answer: correctAnswer,
        points,
        time_limit_seconds: timeLimit,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/admin/game/${gameId}`);
    return { success: true, question };
  } catch (error) {
    console.error("Error creating Relay Quiz question:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to create question",
    };
  }
}

/**
 * Submit a Relay Quiz answer (with race condition protection)
 */
export async function submitRelayQuizAnswer(
  sessionId: string,
  teamId: string,
  participantId: string,
  questionId: string,
  answer: string,
  previousAnswer?: string
) {
  try {
    console.log(`📝 Submitting Relay Quiz answer: team=${teamId}, question=${questionId}`);
    
    // Get question data for validation
    const { data: question, error: questionError } = await supabase
      .from("relay_quiz_questions")
      .select("correct_answer, points")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      console.error("❌ Question not found:", questionError);
      return { success: false, error: "Question not found" };
    }

    // Use atomic database function to prevent race conditions
    const { data: result, error: rpcError } = await supabase.rpc(
      "submit_relay_quiz_answer_safe",
      {
        p_session_id: sessionId,
        p_team_id: teamId,
        p_participant_id: participantId,
        p_question_id: questionId,
        p_answer: answer,
        p_correct_answer: question.correct_answer,
        p_points: question.points,
        p_previous_answer: previousAnswer || null,
      }
    );

    if (rpcError) {
      console.error("❌ RPC error:", rpcError);
      throw rpcError;
    }

    if (!result.success) {
      console.warn("⚠️ Answer submission failed:", result.error);
      return { success: false, error: result.error };
    }

    console.log(`✅ Answer submitted: correct=${result.is_correct}, points=${result.points_earned}`);

    // Get team progress for isLastQuestion check
    const { data: teamProgress } = await supabase
      .from("relay_quiz_team_progress")
      .select("total_questions")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    revalidatePath("/admin");
    return {
      success: true,
      isCorrect: result.is_correct,
      pointsEarned: result.points_earned,
      nextQuestionOrder: result.next_question_order,
      isLastQuestion: result.next_question_order > (teamProgress?.total_questions || 0),
    };
  } catch (error) {
    console.error("❌ Error submitting Relay Quiz answer:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to submit answer",
    };
  }
}

/**
 * Get Relay Quiz session data
 */
export async function getRelayQuizSession(sessionId: string) {
  try {
    const { data: session, error } = await supabase
      .from("relay_quiz_sessions")
      .select(
        `
        *,
        relay_quiz_team_progress (
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
    console.error("Error getting Relay Quiz session:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get session",
    };
  }
}

/**
 * Get Relay Quiz questions for a game and round
 */
export async function getRelayQuizQuestions(
  gameId: string,
  roundNumber: number
) {
  try {
    const { data: questions, error } = await supabase
      .from("relay_quiz_questions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", roundNumber)
      .order("question_order");

    if (error) throw error;

    return { success: true, questions: questions || [] };
  } catch (error) {
    console.error("Error getting Relay Quiz questions:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get questions",
    };
  }
}

/**
 * Get current question for a team
 */
export async function getCurrentQuestionForTeam(
  sessionId: string,
  teamId: string
) {
  try {
    console.log(`🔍 [Relay Quiz] Getting current question for team ${teamId} in session ${sessionId}`);
    
    // Get team progress
    const { data: teamProgress, error: progressError } = await supabase
      .from("relay_quiz_team_progress")
      .select("current_question_order, total_questions")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    if (progressError || !teamProgress) {
      console.error("❌ [Relay Quiz] Team progress not found:", progressError);
      return { success: false, error: "Team progress not found" };
    }

    console.log(`📊 [Relay Quiz] Team progress: ${teamProgress.current_question_order}/${teamProgress.total_questions}`);

    if (teamProgress.current_question_order > teamProgress.total_questions) {
      console.log("✅ [Relay Quiz] Team completed all questions");
      return { success: true, question: null, isComplete: true };
    }

    // Get session with question_data
    const { data: session, error: sessionError } = await supabase
      .from("relay_quiz_sessions")
      .select("game_id, round_number, question_data")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error("❌ [Relay Quiz] Session not found:", sessionError);
      return { success: false, error: "Session not found" };
    }

    let question = null;

    // Try to get question from question_data first (faster)
    if (session.question_data) {
      try {
        const questions = JSON.parse(session.question_data);
        question = questions.find((q: any) => q.question_order === teamProgress.current_question_order);
        console.log(`📝 [Relay Quiz] Found question from question_data:`, question?.question_order);
      } catch (e) {
        console.error("❌ [Relay Quiz] Failed to parse question_data:", e);
      }
    }

    // Fallback to database query if question_data is not available
    if (!question) {
      console.log("🔄 [Relay Quiz] Falling back to database query for question");
      const { data: dbQuestion, error: questionError } = await supabase
        .from("relay_quiz_questions")
        .select("*")
        .eq("game_id", session.game_id)
        .eq("round_number", session.round_number)
        .eq("question_order", teamProgress.current_question_order)
        .single();

      if (questionError || !dbQuestion) {
        console.error("❌ [Relay Quiz] Question not found:", questionError);
        return { success: false, error: "Question not found" };
      }
      
      question = dbQuestion;
      console.log(`📝 [Relay Quiz] Found question from database:`, question.question_order);
    }

    // Get previous answer if this is not the first question
    let previousAnswer = null;
    if (teamProgress.current_question_order > 1) {
      // Get the previous question's correct answer from the last successful attempt
      const previousQuestionOrder = teamProgress.current_question_order - 1;
      
      const { data: previousAttempt } = await supabase
        .from("relay_quiz_attempts")
        .select("answer, is_correct")
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("is_correct", true)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .single();

      if (previousAttempt) {
        previousAnswer = previousAttempt.answer;
        console.log(`📝 [Relay Quiz] Previous answer: ${previousAnswer}`);
      }
    }

    return {
      success: true,
      question: {
        ...question,
        previousAnswer,
      },
      isComplete: false,
    };
  } catch (error) {
    console.error("❌ [Relay Quiz] Error getting current question for team:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get current question",
    };
  }
}

/**
 * Get team members for a team
 */
export async function getTeamMembers(teamId: string) {
  try {
    const { data: members, error } = await supabase
      .from("participants")
      .select("id, nickname, student_id")
      .eq("team_id", teamId)
      .order("joined_at");

    if (error) throw error;

    return { success: true, members: members || [] };
  } catch (error) {
    console.error("Error getting team members:", error);
    return {
      success: false,
      error: (error as Error).message || "Failed to get team members",
    };
  }
}
