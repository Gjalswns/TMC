"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Play,
  Square,
  Plus,
  Users,
  Trophy,
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
} from "lucide-react";
import {
  createRelayQuizSession,
  startRelayQuizSession,
  endRelayQuizSession,
  createRelayQuizQuestion,
  getRelayQuizQuestions,
  getRelayQuizSession,
} from "@/lib/relay-quiz-actions";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  useRelayQuizSessionUpdates,
  useRelayQuizTeamProgressUpdates,
} from "@/hooks/use-realtime";

interface RelayQuizSession {
  id: string;
  game_id: string;
  round_number: number;
  status: "waiting" | "active" | "finished";
  time_limit_seconds: number;
  started_at?: string;
  ended_at?: string;
  relay_quiz_team_progress?: Array<{
    id: string;
    team_id: string;
    current_question_order: number;
    total_questions: number;
    questions_completed: number;
    total_score: number;
    last_participant_id: string;
    teams: {
      id: string;
      team_name: string;
      team_number: number;
      score: number;
    };
  }>;
}

interface RelayQuizQuestion {
  id: string;
  question_order: number;
  question_text: string;
  correct_answer: string;
  points: number;
}

interface RelayQuizAdminProps {
  gameId: string;
  currentRound: number;
  onGameUpdate?: () => void;
}

export function RelayQuizAdmin({
  gameId,
  currentRound,
  onGameUpdate,
}: RelayQuizAdminProps) {
  const [session, setSession] = useState<RelayQuizSession | null>(null);
  const [questions, setQuestions] = useState<RelayQuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const { toast } = useToast();

  // Form state for new question
  const [newQuestion, setNewQuestion] = useState({
    questionOrder: 1,
    questionText: "",
    correctAnswer: "",
    points: 10,
  });

  // Load session and data
  useEffect(() => {
    const loadData = async () => {
      // Check for existing session
      const { data: existingSession } = await supabase
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
        .eq("game_id", gameId)
        .eq("round_number", currentRound)
        .single();

      if (existingSession) {
        setSession(existingSession);
      }

      // Load questions
      const questionsResult = await getRelayQuizQuestions(gameId, currentRound);
      if (questionsResult.success && questionsResult.questions) {
        setQuestions(questionsResult.questions);
        // Update question order for new question
        setNewQuestion((prev) => ({
          ...prev,
          questionOrder: questionsResult.questions.length + 1,
        }));
      }
    };

    loadData();
  }, [gameId, currentRound]);

  // Timer for active sessions
  useEffect(() => {
    if (session?.status === "active" && session.started_at) {
      const startTime = new Date(session.started_at).getTime();
      const timeLimit = session.time_limit_seconds * 1000;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, timeLimit - elapsed);

      setRemainingTime(Math.floor(remaining / 1000));

      const timer = setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [session?.status, session?.started_at, session?.time_limit_seconds]);

  const createNewSession = async () => {
    setIsLoading(true);
    try {
      const result = await createRelayQuizSession(gameId, currentRound, 300); // 5 minutes
      if (result.success) {
        setSession(result.session);
        toast({
          title: "Session Created",
          description: "Relay Quiz session created successfully",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create session",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startSession = async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const result = await startRelayQuizSession(session.id);
      if (result.success) {
        setSession({
          ...session,
          status: "active",
          started_at: new Date().toISOString(),
        });
        toast({
          title: "Game Started!",
          description:
            "Relay Quiz has begun! Teams can now solve questions in sequence.",
        });
        onGameUpdate?.();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to start session",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const result = await endRelayQuizSession(session.id);
      if (result.success) {
        setSession({
          ...session,
          status: "finished",
          ended_at: new Date().toISOString(),
        });
        toast({
          title: "Game Ended",
          description: "Relay Quiz has ended. Check the final results.",
        });
        onGameUpdate?.();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to end session",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to end session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateQuestion = async () => {
    if (!newQuestion.questionText || !newQuestion.correctAnswer) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await createRelayQuizQuestion(
        gameId,
        currentRound,
        newQuestion.questionOrder,
        newQuestion.questionText,
        newQuestion.correctAnswer,
        newQuestion.points
      );

      if (result.success) {
        setQuestions([...questions, result.question]);
        setNewQuestion({
          questionOrder: newQuestion.questionOrder + 1,
          questionText: "",
          correctAnswer: "",
          points: 10,
        });
        setShowQuestionForm(false);
        toast({
          title: "Question Created",
          description: "New relay question added successfully",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create question",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create question",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSession = async () => {
    if (session) {
      const result = await getRelayQuizSession(session.id);
      if (result.success) {
        setSession(result.session);
      }
    }
  };

  // Real-time updates
  const handleSessionUpdate = useCallback(
    (updatedSession: any) => {
      if (
        updatedSession.game_id === gameId &&
        updatedSession.round_number === currentRound
      ) {
        setSession(updatedSession);
      }
    },
    [gameId, currentRound]
  );

  const handleTeamProgressUpdate = useCallback(
    (updatedProgress: any) => {
      if (session?.relay_quiz_team_progress) {
        const updatedProgressList = session.relay_quiz_team_progress.map(
          (progress) =>
            progress.id === updatedProgress.id ? updatedProgress : progress
        );
        setSession((prev) =>
          prev
            ? { ...prev, relay_quiz_team_progress: updatedProgressList }
            : null
        );
      }
    },
    [session?.relay_quiz_team_progress]
  );

  useRelayQuizSessionUpdates(gameId, handleSessionUpdate);
  useRelayQuizTeamProgressUpdates(session?.id || "", handleTeamProgressUpdate);

  // Refresh session every 3 seconds when game is active (fallback)
  useEffect(() => {
    if (session?.status === "active") {
      const interval = setInterval(refreshSession, 3000);
      return () => clearInterval(interval);
    }
  }, [session?.status, session?.id]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercentage = session?.time_limit_seconds
    ? ((session.time_limit_seconds - remainingTime) /
      session.time_limit_seconds) *
    100
    : 0;

  const sortedTeams =
    session?.relay_quiz_team_progress?.sort(
      (a, b) => b.total_score - a.total_score
    ) || [];

  return (
    <div className="space-y-6">
      {/* Session Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Relay Quiz Control
          </CardTitle>
          <CardDescription>
            Round {currentRound} - Manage the Relay Quiz game session
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No session exists for this round. Create a session to start
                  the Relay Quiz game.
                </AlertDescription>
              </Alert>
              <Button onClick={createNewSession} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Relay Quiz Session"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Badge
                    variant={
                      session.status === "active"
                        ? "default"
                        : session.status === "finished"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {session.status === "waiting" && "Waiting to Start"}
                    {session.status === "active" && "Game Active"}
                    {session.status === "finished" && "Game Finished"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {session.status === "waiting" && (
                    <Button onClick={startSession} disabled={isLoading}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Game
                    </Button>
                  )}
                  {session.status === "active" && (
                    <Button
                      onClick={endSession}
                      disabled={isLoading}
                      variant="destructive"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      End Game
                    </Button>
                  )}
                </div>
              </div>

              {/* Timer */}
              {session.status === "active" && (
                <div>
                  <h4 className="font-medium mb-2">Time Remaining</h4>
                  <div className="text-3xl font-bold mb-2">
                    {formatTime(remainingTime)}
                  </div>
                  <Progress value={progressPercentage} className="w-full" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Question Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Question Management
          </CardTitle>
          <CardDescription>
            Add relay questions for Round {currentRound}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {questions.length} questions available
            </span>
            <Button
              onClick={() => setShowQuestionForm(!showQuestionForm)}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>

          {showQuestionForm && (
            <div className="space-y-4 p-4 border rounded-lg">
              <div>
                <Label htmlFor="questionOrder">Question Order</Label>
                <Input
                  id="questionOrder"
                  type="number"
                  value={newQuestion.questionOrder}
                  onChange={(e) =>
                    setNewQuestion({
                      ...newQuestion,
                      questionOrder: parseInt(e.target.value) || 1,
                    })
                  }
                  min="1"
                />
              </div>
              <div>
                <Label htmlFor="questionText">Question Text</Label>
                <Textarea
                  id="questionText"
                  value={newQuestion.questionText}
                  onChange={(e) =>
                    setNewQuestion({
                      ...newQuestion,
                      questionText: e.target.value,
                    })
                  }
                  placeholder="Enter the question (include the previous answer in the question)..."
                />
              </div>
              <div>
                <Label htmlFor="correctAnswer">Correct Answer</Label>
                <Input
                  id="correctAnswer"
                  value={newQuestion.correctAnswer}
                  onChange={(e) =>
                    setNewQuestion({
                      ...newQuestion,
                      correctAnswer: e.target.value,
                    })
                  }
                  placeholder="This answer will be used in the next question..."
                />
              </div>
              <div>
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  type="number"
                  value={newQuestion.points}
                  onChange={(e) =>
                    setNewQuestion({
                      ...newQuestion,
                      points: parseInt(e.target.value) || 10,
                    })
                  }
                  min="1"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateQuestion} disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Question"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowQuestionForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-2">
            {questions.map((question) => (
              <div
                key={question.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">#{question.question_order}</Badge>
                    <Badge variant="secondary">{question.points} pts</Badge>
                  </div>
                  <p className="font-medium">{question.question_text}</p>
                  <p className="text-sm text-muted-foreground">
                    Answer: {question.correct_answer}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team Progress */}
      {session?.relay_quiz_team_progress &&
        session.relay_quiz_team_progress.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Progress
              </CardTitle>
              <CardDescription>
                Real-time team progress through the relay questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sortedTeams.map((team, index) => {
                  const progressPercentage =
                    (team.questions_completed / team.total_questions) * 100;
                  const isWinning = index === 0 && team.total_score > 0;

                  return (
                    <div
                      key={team.team_id}
                      className={`p-4 rounded-lg border ${isWinning
                        ? "bg-yellow-50 border-yellow-200"
                        : "bg-muted/50"
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {isWinning && (
                            <Trophy className="h-5 w-5 text-yellow-500" />
                          )}
                          <span className="font-medium text-lg">
                            #{index + 1}
                          </span>
                          <span className="font-medium">
                            {team.teams.team_name}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">
                            {team.total_score}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            points
                          </div>
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>
                            Question {team.current_question_order} of{" "}
                            {team.total_questions}
                          </span>
                          <span>{Math.round(progressPercentage)}%</span>
                        </div>
                        <Progress value={progressPercentage} className="h-2" />
                      </div>

                      <div className="text-sm text-muted-foreground">
                        Completed: {team.questions_completed}/
                        {team.total_questions} questions
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Game Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Game Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium">How Relay Quiz Works</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-1">
              <li>• Each team member takes turns answering questions</li>
              <li>
                • The answer to each question becomes part of the next question
              </li>
              <li>• Teams must complete questions in order (1, 2, 3, 4...)</li>
              <li>• Each correct answer earns points and advances the team</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Question Design</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-1">
              <li>• Question 1: Contains a number that becomes the answer</li>
              <li>
                • Question 2: Uses the answer from Question 1 in the question
                text
              </li>
              <li>
                • Question 3: Uses the answer from Question 2 in the question
                text
              </li>
              <li>• And so on...</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
