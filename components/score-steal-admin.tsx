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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Play,
  Square,
  Plus,
  Target,
  Users,
  Trophy,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  createScoreStealSession,
  startScoreStealSession,
  endScoreStealSession,
  createScoreStealQuestion,
  getScoreStealQuestions,
  getScoreStealAttempts,
  getAvailableTargets,
} from "@/lib/score-steal-actions";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useScoreStealSessionUpdates,
  useScoreStealAttemptsUpdates,
} from "@/hooks/use-realtime";

interface ScoreStealSession {
  id: string;
  game_id: string;
  round_number: number;
  status: "waiting" | "active" | "finished";
  started_at?: string;
  ended_at?: string;
}

interface ScoreStealQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
}

interface Team {
  id: string;
  team_name: string;
  team_number: number;
  score: number;
}

interface ScoreStealAttempt {
  id: string;
  team_id: string;
  target_team_id: string;
  answer: string;
  is_correct: boolean;
  points_gained: number;
  points_lost: number;
  submitted_at: string;
  teams: {
    team_name: string;
    team_number: number;
  };
  teams_2: {
    team_name: string;
    team_number: number;
  };
  score_steal_questions: {
    question_text: string;
    difficulty: string;
    points: number;
  };
}

interface ScoreStealAdminProps {
  gameId: string;
  currentRound: number;
  onGameUpdate?: () => void;
}

export function ScoreStealAdmin({
  gameId,
  currentRound,
  onGameUpdate,
}: ScoreStealAdminProps) {
  const [session, setSession] = useState<ScoreStealSession | null>(null);
  const [questions, setQuestions] = useState<ScoreStealQuestion[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [attempts, setAttempts] = useState<ScoreStealAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const { toast } = useToast();

  // Form state for new question
  const [newQuestion, setNewQuestion] = useState({
    questionText: "",
    correctAnswer: "",
    difficulty: "easy" as "easy" | "medium" | "hard",
  });

  // Load session and data
  useEffect(() => {
    const loadData = async () => {
      // Check for existing session
      const { data: existingSession } = await supabase
        .from("score_steal_sessions")
        .select("*")
        .eq("game_id", gameId)
        .eq("round_number", currentRound)
        .single();

      if (existingSession) {
        setSession(existingSession);
      }

      // Load questions for current round
      const questionsResult = await getScoreStealQuestions(
        gameId,
        currentRound
      );
      if (questionsResult.success) {
        setQuestions(questionsResult.questions);
      }

      // Load teams
      const teamsResult = await getAvailableTargets(gameId);
      if (teamsResult.success) {
        setTeams(teamsResult.teams);
      }

      // Load attempts if session exists
      if (existingSession) {
        const attemptsResult = await getScoreStealAttempts(
          gameId,
          currentRound
        );
        if (attemptsResult.success) {
          setAttempts(attemptsResult.attempts);
        }
      }
    };

    loadData();
  }, [gameId, currentRound]);

  const createNewSession = async () => {
    setIsLoading(true);
    try {
      const result = await createScoreStealSession(gameId, currentRound);
      if (result.success) {
        setSession(result.session);
        toast({
          title: "Session Created",
          description: "Score Steal session created successfully",
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
      const result = await startScoreStealSession(session.id);
      if (result.success) {
        setSession({
          ...session,
          status: "active",
          started_at: new Date().toISOString(),
        });
        toast({
          title: "Game Started!",
          description:
            "Score Steal game has begun! Teams can now attack each other.",
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
      const result = await endScoreStealSession(session.id);
      if (result.success) {
        setSession({
          ...session,
          status: "finished",
          ended_at: new Date().toISOString(),
        });
        toast({
          title: "Game Ended",
          description: "Score Steal game has ended. Check the final results.",
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
      const result = await createScoreStealQuestion(
        gameId,
        currentRound,
        newQuestion.questionText,
        newQuestion.correctAnswer,
        newQuestion.difficulty
      );

      if (result.success) {
        setQuestions([...questions, result.question]);
        setNewQuestion({
          questionText: "",
          correctAnswer: "",
          difficulty: "easy",
        });
        setShowQuestionForm(false);
        toast({
          title: "Question Created",
          description: "New question added successfully",
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

  const refreshAttempts = async () => {
    if (session) {
      const result = await getScoreStealAttempts(gameId, currentRound);
      if (result.success) {
        setAttempts(result.attempts);
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

  const handleAttemptsUpdate = useCallback((newAttempt: any) => {
    setAttempts((prev) => [newAttempt, ...prev]);
  }, []);

  useScoreStealSessionUpdates(gameId, handleSessionUpdate);
  useScoreStealAttemptsUpdates(gameId, currentRound, handleAttemptsUpdate);

  // Refresh attempts every 5 seconds when game is active (fallback)
  useEffect(() => {
    if (session?.status === "active") {
      const interval = setInterval(refreshAttempts, 5000);
      return () => clearInterval(interval);
    }
  }, [session?.status, gameId, currentRound]);

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      {/* Session Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Score Steal Game Control
          </CardTitle>
          <CardDescription>
            Round {currentRound} - Manage the Score Steal game session
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No session exists for this round. Create a session to start
                  the Score Steal game.
                </AlertDescription>
              </Alert>
              <Button onClick={createNewSession} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Score Steal Session"}
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
            Add questions for the Score Steal game
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
                  placeholder="Enter the question..."
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
                  placeholder="Enter the correct answer..."
                />
              </div>
              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={newQuestion.difficulty}
                  onValueChange={(value: "easy" | "medium" | "hard") =>
                    setNewQuestion({ ...newQuestion, difficulty: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy (10 points)</SelectItem>
                    <SelectItem value="medium">Medium (20 points)</SelectItem>
                    <SelectItem value="hard">Hard (30 points)</SelectItem>
                  </SelectContent>
                </Select>
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
                  <p className="font-medium">{question.question_text}</p>
                  <p className="text-sm text-muted-foreground">
                    Answer: {question.correct_answer}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{question.difficulty}</Badge>
                  <Badge variant="secondary">{question.points} pts</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Live Scoreboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Live Scoreboard
          </CardTitle>
          <CardDescription>Current team scores and rankings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedTeams.map((team, index) => (
              <div
                key={team.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  index === 0 ? "bg-yellow-50 border-yellow-200" : "bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  {index === 0 && (
                    <Trophy className="h-5 w-5 text-yellow-500" />
                  )}
                  <span className="font-medium text-lg">#{index + 1}</span>
                  <span className="font-medium">{team.team_name}</span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{team.score}</div>
                  <div className="text-sm text-muted-foreground">points</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Attempts */}
      {attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Attacks
            </CardTitle>
            <CardDescription>
              Live feed of team attacks and results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attempts.slice(0, 10).map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {attempt.is_correct ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">
                        {attempt.teams.team_name} attacked{" "}
                        {attempt.teams_2.team_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {attempt.score_steal_questions.question_text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Answer: {attempt.answer} |{" "}
                        {attempt.score_steal_questions.difficulty} |{" "}
                        {attempt.score_steal_questions.points} pts
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        attempt.is_correct ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {attempt.points_gained > 0 ? "+" : ""}
                      {attempt.points_gained}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(attempt.submitted_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
