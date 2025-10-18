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
  Users,
  Trophy,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  ArrowRight,
} from "lucide-react";
import {
  submitRelayQuizAnswer,
  getCurrentQuestionForTeam,
  getTeamMembers,
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

interface RelayQuizQuestion {
  id: string;
  question_order: number;
  question_text: string;
  correct_answer: string;
  points: number;
  previousAnswer?: string;
}

interface TeamMember {
  id: string;
  nickname: string;
  student_id?: string;
}

interface RelayQuizPlayViewProps {
  gameId: string;
  currentRound: number;
  teamId: string;
  participantId: string;
}

export function RelayQuizPlayView({
  gameId,
  currentRound,
  teamId,
  participantId,
}: RelayQuizPlayViewProps) {
  const [currentQuestion, setCurrentQuestion] =
    useState<RelayQuizQuestion | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [session, setSession] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    pointsEarned: number;
  } | null>(null);
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0);
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      // Get session
      const { data: sessionData } = await supabase
        .from("relay_quiz_sessions")
        .select("*")
        .eq("game_id", gameId)
        .eq("round_number", currentRound)
        .single();

      if (sessionData) {
        setSession(sessionData);
      }

      // Load team members
      const membersResult = await getTeamMembers(teamId);
      if (membersResult.success) {
        setTeamMembers(membersResult.members);
      }

      // Load current question
      if (sessionData) {
        const questionResult = await getCurrentQuestionForTeam(
          sessionData.id,
          teamId
        );
        if (questionResult.success) {
          if (questionResult.isComplete) {
            setIsComplete(true);
          } else {
            setCurrentQuestion(questionResult.question);
          }
        }
      }
    };

    loadData();
  }, [gameId, currentRound, teamId]);

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
    async (updatedProgress: any) => {
      if (updatedProgress.team_id === teamId && session) {
        // Refresh current question when team progress updates
        const questionResult = await getCurrentQuestionForTeam(
          session.id,
          teamId
        );
        if (questionResult.success) {
          if (questionResult.isComplete) {
            setIsComplete(true);
          } else {
            setCurrentQuestion(questionResult.question);
          }
        }
      }
    },
    [teamId, session]
  );

  useRelayQuizSessionUpdates(gameId, handleSessionUpdate);
  useRelayQuizTeamProgressUpdates(session?.id || "", handleTeamProgressUpdate);

  // Refresh question every 5 seconds when game is active (fallback)
  useEffect(() => {
    if (session?.status === "active" && !isComplete) {
      const interval = setInterval(async () => {
        const questionResult = await getCurrentQuestionForTeam(
          session.id,
          teamId
        );
        if (questionResult.success) {
          if (questionResult.isComplete) {
            setIsComplete(true);
          } else {
            setCurrentQuestion(questionResult.question);
          }
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [session?.status, session?.id, teamId, isComplete]);

  const handleSubmitAnswer = async () => {
    if (!currentQuestion || !answer.trim()) {
      toast({
        title: "Error",
        description: "Please provide an answer",
        variant: "destructive",
      });
      return;
    }

    if (!session) {
      toast({
        title: "Error",
        description: "Session not found",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitRelayQuizAnswer(
        session.id,
        teamId,
        participantId,
        currentQuestion.id,
        answer.trim(),
        currentQuestion.previousAnswer
      );

      if (result.success) {
        setLastResult({
          isCorrect: result.isCorrect,
          pointsEarned: result.pointsEarned,
        });

        // Clear form
        setAnswer("");

        // Move to next team member
        setCurrentMemberIndex((prev) => (prev + 1) % teamMembers.length);

        // Check if this was the last question
        if (result.isLastQuestion) {
          setIsComplete(true);
        } else {
          // Refresh current question
          const questionResult = await getCurrentQuestionForTeam(
            session.id,
            teamId
          );
          if (questionResult.success) {
            setCurrentQuestion(questionResult.question);
          }
        }

        toast({
          title: result.isCorrect ? "Correct!" : "Incorrect",
          description: result.isCorrect
            ? `You earned ${result.pointsEarned} points!`
            : "Better luck next time!",
          variant: result.isCorrect ? "default" : "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to submit answer",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit answer",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentMember = teamMembers[currentMemberIndex];

  if (isComplete) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Relay Quiz Complete!
            </CardTitle>
            <CardDescription>
              Your team has completed all questions in this round.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Great job! Your team has finished the relay quiz. Check the
                leaderboard to see your final ranking.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
            <CardDescription>
              Getting your next question ready...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Relay Quiz
          </CardTitle>
          <CardDescription>
            Round {currentRound} - Work together to solve questions in sequence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              Each team member takes turns answering questions. The answer to
              each question becomes part of the next question!
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Team Member Turn */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Turn
          </CardTitle>
          <CardDescription>
            It's your turn to answer the question
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-lg font-bold">
              {currentMemberIndex + 1}
            </div>
            <div>
              <p className="font-medium">
                {currentMember?.nickname || "Loading..."}
              </p>
              <p className="text-sm text-muted-foreground">
                Team Member {currentMemberIndex + 1} of {teamMembers.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Question */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Question {currentQuestion.question_order}
          </CardTitle>
          <CardDescription>
            Answer this question to help your team advance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentQuestion.previousAnswer && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-1">
                Previous Answer
              </h4>
              <p className="text-blue-800">{currentQuestion.previousAnswer}</p>
              <p className="text-sm text-blue-600 mt-1">
                Use this answer in the question below
              </p>
            </div>
          )}

          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Question:</h4>
            <p className="text-lg">{currentQuestion.question_text}</p>
            <div className="flex gap-2 mt-3">
              <Badge variant="outline">
                Question {currentQuestion.question_order}
              </Badge>
              <Badge variant="secondary">{currentQuestion.points} points</Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="answer">Your Answer</Label>
            <Input
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter your answer..."
              onKeyPress={(e) => e.key === "Enter" && handleSubmitAnswer()}
            />
          </div>

          <Button
            onClick={handleSubmitAnswer}
            disabled={isSubmitting || !answer.trim()}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </CardContent>
      </Card>

      {/* Last Result */}
      {lastResult && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`flex items-center gap-3 p-4 rounded-lg ${
                lastResult.isCorrect
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              {lastResult.isCorrect ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <h4 className="font-medium">
                  {lastResult.isCorrect
                    ? "Correct Answer!"
                    : "Incorrect Answer"}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {lastResult.isCorrect
                    ? `You earned ${lastResult.pointsEarned} points!`
                    : "Don't worry, the next team member can try again."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            Your team members and their turn order
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {teamMembers.map((member, index) => (
              <div
                key={member.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  index === currentMemberIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50"
                }`}
              >
                <div className="w-8 h-8 bg-muted text-muted-foreground rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{member.nickname}</p>
                  {member.student_id && (
                    <p className="text-sm text-muted-foreground">
                      ID: {member.student_id}
                    </p>
                  )}
                </div>
                {index === currentMemberIndex && (
                  <ArrowRight className="h-4 w-4" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Game Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            How Relay Quiz Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium">Teamwork Required</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-1">
              <li>• Each team member takes turns answering questions</li>
              <li>• Questions must be answered in order (1, 2, 3, 4...)</li>
              <li>
                • The answer to each question becomes part of the next question
              </li>
              <li>• Work together to solve the sequence!</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Scoring</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-1">
              <li>• Each correct answer earns points for your team</li>
              <li>• Wrong answers don't cost points, but slow your progress</li>
              <li>• Complete all questions to maximize your team's score</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
