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

    const { data: session, error } = await supabase
      .from("relay_quiz_sessions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        time_limit_seconds: timeLimit,
        status: "waiting",
      })
      .select()
      .single();

    if (error) throw error;

    // Get questions for this round
    const { data: questions } = await supabase
      .from("relay_quiz_questions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", roundNumber)
      .order("question_order");

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
 * End a Relay Quiz Game session
 */
export async function endRelayQuizSession(sessionId: string) {
  try {
    const { error } = await supabase
      .from("relay_quiz_sessions")
      .update({
        status: "finished",
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) throw error;

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
  points: number = 10
) {
  try {
    const { data: question, error } = await supabase
      .from("relay_quiz_questions")
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        question_order: questionOrder,
        question_text: questionText,
        correct_answer: correctAnswer,
        points,
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
 * Submit a Relay Quiz answer
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
    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from("relay_quiz_sessions")
      .select("status, game_id, round_number")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: "Session not found" };
    }

    if (session.status !== "active") {
      return { success: false, error: "Session is not active" };
    }

    // Get question data
    const { data: question, error: questionError } = await supabase
      .from("relay_quiz_questions")
      .select("correct_answer, points, question_order")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      return { success: false, error: "Question not found" };
    }

    // Get team progress
    const { data: teamProgress, error: progressError } = await supabase
      .from("relay_quiz_team_progress")
      .select("*")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    if (progressError || !teamProgress) {
      return { success: false, error: "Team progress not found" };
    }

    // Check if this is the correct question for the team
    if (teamProgress.current_question_order !== question.question_order) {
      return { success: false, error: "Wrong question order" };
    }

    // Check if this participant already answered this question
    const { data: existingAttempt } = await supabase
      .from("relay_quiz_attempts")
      .select("id")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .eq("participant_id", participantId)
      .eq("question_id", questionId)
      .single();

    if (existingAttempt) {
      return {
        success: false,
        error: "Participant already answered this question",
      };
    }

    const isCorrect =
      answer.toLowerCase().trim() ===
      question.correct_answer.toLowerCase().trim();
    const pointsEarned = isCorrect ? question.points : 0;

    // Record the attempt
    const { error: attemptError } = await supabase
      .from("relay_quiz_attempts")
      .insert({
        session_id: sessionId,
        team_id: teamId,
        participant_id: participantId,
        question_id: questionId,
        answer,
        is_correct: isCorrect,
        previous_answer: previousAnswer,
        points_earned: pointsEarned,
      });

    if (attemptError) throw attemptError;

    // Update team progress
    const newQuestionsCompleted = teamProgress.questions_completed + 1;
    const newTotalScore = teamProgress.total_score + pointsEarned;
    const newCurrentQuestionOrder = teamProgress.current_question_order + 1;

    const { error: updateProgressError } = await supabase
      .from("relay_quiz_team_progress")
      .update({
        questions_completed: newQuestionsCompleted,
        total_score: newTotalScore,
        current_question_order: newCurrentQuestionOrder,
        last_participant_id: participantId,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("team_id", teamId);

    if (updateProgressError) throw updateProgressError;

    // Update team score in teams table
    if (isCorrect) {
      const { error: teamScoreError } = await supabase.rpc('increment_team_score', {
        team_id: teamId,
        points: pointsEarned
      });

      if (teamScoreError) throw teamScoreError;
    }

    revalidatePath("/admin");
    return {
      success: true,
      isCorrect,
      pointsEarned,
      nextQuestionOrder: newCurrentQuestionOrder,
      isLastQuestion: newCurrentQuestionOrder > teamProgress.total_questions,
    };
  } catch (error) {
    console.error("Error submitting Relay Quiz answer:", error);
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
    // Get team progress
    const { data: teamProgress, error: progressError } = await supabase
      .from("relay_quiz_team_progress")
      .select("current_question_order, total_questions")
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .single();

    if (progressError || !teamProgress) {
      return { success: false, error: "Team progress not found" };
    }

    if (teamProgress.current_question_order > teamProgress.total_questions) {
      return { success: true, question: null, isComplete: true };
    }

    // Get session to find game_id and round_number
    const { data: session, error: sessionError } = await supabase
      .from("relay_quiz_sessions")
      .select("game_id, round_number")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: "Session not found" };
    }

    // Get current question
    const { data: question, error: questionError } = await supabase
      .from("relay_quiz_questions")
      .select("*")
      .eq("game_id", session.game_id)
      .eq("round_number", session.round_number)
      .eq("question_order", teamProgress.current_question_order)
      .single();

    if (questionError || !question) {
      return { success: false, error: "Question not found" };
    }

    // Get previous answer if this is not the first question
    let previousAnswer = null;
    if (teamProgress.current_question_order > 1) {
      const { data: previousAttempt } = await supabase
        .from("relay_quiz_attempts")
        .select("answer")
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("question_id", question.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .single();

      previousAnswer = previousAttempt?.answer || null;
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
    console.error("Error getting current question for team:", error);
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
