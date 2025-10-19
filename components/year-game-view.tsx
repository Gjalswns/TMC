"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calculator,
  Clock,
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trophy,
  Users,
} from "lucide-react";
import {
  submitYearGameAttempt,
  getYearGameTeamResults,
  getYearGameTeamAttempts,
} from "@/lib/year-game-actions";
import { generateExampleExpressions } from "@/lib/year-game-utils";
import { useToast } from "@/components/ui/use-toast";

interface YearGameSession {
  id: string;
  target_numbers: number[];
  time_limit_seconds: number;
  status: "waiting" | "active" | "finished";
  started_at?: string;
  ended_at?: string;
}

interface YearGameResult {
  id: string;
  numbers_found: number[];
  total_found: number;
  score: number;
}

interface YearGameAttempt {
  id: string;
  expression: string;
  target_number: number;
  is_valid: boolean;
  is_correct: boolean;
  is_duplicate: boolean;
  submitted_at: string;
  participants?: {
    nickname: string;
  };
}

interface YearGameViewProps {
  session: YearGameSession;
  teamId: string;
  participantId: string;
  teamName: string;
  participantName: string;
}

export function YearGameView({
  session,
  teamId,
  participantId,
  teamName,
  participantName,
}: YearGameViewProps) {
  const [expression, setExpression] = useState("");
  const [targetNumber, setTargetNumber] = useState<number>(1);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [teamResult, setTeamResult] = useState<YearGameResult | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<YearGameAttempt[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Calculate remaining time
  useEffect(() => {
    if (session.status === "active" && session.started_at) {
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
  }, [session.status, session.started_at, session.time_limit_seconds]);

  // Load team results and attempts
  useEffect(() => {
    const loadData = async () => {
      const [resultResponse, attemptsResponse] = await Promise.all([
        getYearGameTeamResults(session.id, teamId),
        getYearGameTeamAttempts(session.id, teamId, 5),
      ]);

      if (resultResponse.success) {
        setTeamResult(resultResponse.result);
      }

      if (attemptsResponse.success) {
        setRecentAttempts(attemptsResponse.attempts);
      }
    };

    loadData();
  }, [session.id, teamId]);

  const handleSubmit = async () => {
    if (!expression.trim()) {
      toast({
        title: "Error",
        description: "Please enter an expression",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await submitYearGameAttempt(
        session.id,
        teamId,
        participantId,
        expression.trim(),
        targetNumber
      );

      if (response.success) {
        if (response.attempt.isCorrect && response.isNewNumber) {
          toast({
            title: "Success!",
            description: `Great! You found ${targetNumber} = ${expression}`,
          });
          // Reload team results
          const resultResponse = await getYearGameTeamResults(
            session.id,
            teamId
          );
          if (resultResponse.success) {
            setTeamResult(resultResponse.result);
          }
        } else if (response.attempt.isDuplicate) {
          toast({
            title: "Already Found",
            description: `Your team already found ${targetNumber}`,
            variant: "destructive",
          });
        } else if (!response.attempt.isValid) {
          toast({
            title: "Invalid Expression",
            description: "Please check your expression and try again",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Incorrect",
            description: `${expression} does not equal ${targetNumber}`,
            variant: "destructive",
          });
        }

        // Reload recent attempts
        const attemptsResponse = await getYearGameTeamAttempts(
          session.id,
          teamId,
          5
        );
        if (attemptsResponse.success) {
          setRecentAttempts(attemptsResponse.attempts);
        }

        setExpression("");
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to submit attempt",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercentage =
    session.time_limit_seconds > 0
      ? ((session.time_limit_seconds - remainingTime) /
          session.time_limit_seconds) *
        100
      : 0;

  const exampleExpressions = generateExampleExpressions(session.target_numbers);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="container mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Year Game</h1>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="default" className="text-lg px-4 py-2">
              {teamName}
            </Badge>
            <Badge variant="outline">{participantName}</Badge>
          </div>
        </div>

        {/* Timer */}
        {session.status === "active" && (
          <Card className="text-center">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <Clock className="h-6 w-6" />
                <span>Time Remaining</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">
                {formatTime(remainingTime)}
              </div>
              <Progress value={progressPercentage} className="w-full" />
              {remainingTime === 0 && (
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Time's up! The admin can still enter scores.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Target Numbers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Target Numbers
            </CardTitle>
            <CardDescription>
              Use these 4 numbers exactly once each to make expressions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 justify-center">
              {session.target_numbers.map((num, index) => (
                <div
                  key={index}
                  className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-2xl font-bold"
                >
                  {num}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Game Input */}
        {session.status === "active" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Make an Expression
              </CardTitle>
              <CardDescription>
                Create a mathematical expression using the target numbers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter expression (e.g., 3 + 5 × 2)"
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="1"
                  max="99"
                  value={targetNumber}
                  onChange={(e) =>
                    setTargetNumber(parseInt(e.target.value) || 1)
                  }
                  className="w-20"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || remainingTime === 0}
                  className="px-6"
                >
                  {isSubmitting ? "..." : "Submit"}
                </Button>
              </div>

              {/* Example expressions */}
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Examples:</p>
                <div className="space-y-1">
                  {exampleExpressions.map((example, index) => (
                    <p key={index} className="font-mono text-xs">
                      {example}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Progress */}
        {teamResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Team Progress
              </CardTitle>
              <CardDescription>
                Numbers found: {teamResult.total_found}/99 • Score:{" "}
                {teamResult.score}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-11 gap-1 mb-4">
                {Array.from({ length: 99 }, (_, i) => i + 1).map((num) => (
                  <div
                    key={num}
                    className={`w-7 h-7 rounded text-xs flex items-center justify-center font-medium ${
                      teamResult.numbers_found.includes(num)
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {num}
                  </div>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">
                Found: {teamResult.numbers_found.join(", ")}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Attempts */}
        {recentAttempts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Recent Attempts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {attempt.is_correct ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="font-mono text-sm">
                          {attempt.expression}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Target: {attempt.target_number} •{" "}
                          {attempt.participants?.nickname}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={attempt.is_correct ? "default" : "secondary"}
                      >
                        {attempt.is_correct ? "Correct" : "Incorrect"}
                      </Badge>
                      {attempt.is_duplicate && (
                        <Badge variant="outline" className="ml-1">
                          Duplicate
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game Status */}
        {session.status === "waiting" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Waiting for the game to start...
            </AlertDescription>
          </Alert>
        )}

        {session.status === "finished" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Game finished! Check the final results.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
