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
  ArrowLeft,
} from "lucide-react";
import {
  getActiveYearGameSession,
  submitYearGameAttempt,
  getYearGameTeamResults,
  getYearGameTeamAttempts,
} from "@/lib/year-game-actions";
import { generateExampleExpressions } from "@/lib/year-game-utils";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { type Database } from "@/lib/supabase";
import {
  useGameUpdates,
  useTeamUpdates,
  useYearGameSessionUpdates,
  useYearGameResultsUpdates,
  useYearGameAttemptsUpdates,
} from "@/hooks/use-realtime";

type Game = Database["public"]["Tables"]["games"]["Row"];
type Team = Database["public"]["Tables"]["teams"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];

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

interface YearGamePlayViewProps {
  game: Game;
  participant: Participant;
  teams: Team[];
}

export function YearGamePlayView({
  game,
  participant,
  teams,
}: YearGamePlayViewProps) {
  const [session, setSession] = useState<YearGameSession | null>(null);
  const [expression, setExpression] = useState("");
  const [targetNumber, setTargetNumber] = useState<number>(1);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [teamResult, setTeamResult] = useState<YearGameResult | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<YearGameAttempt[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  // Find my team
  useEffect(() => {
    if (participant?.team_id) {
      const team = teams.find((t) => t.id === participant.team_id);
      setMyTeam(team || null);
    }
  }, [participant?.team_id, teams]);

  // Load active session
  useEffect(() => {
    const loadSession = async () => {
      const response = await getActiveYearGameSession(game.id);
      if (response.success && response.session) {
        setSession(response.session);
        setLoading(false);
      } else {
        setLoading(false);
      }
    };
    loadSession();
  }, [game.id]);

  // Calculate remaining time
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

  // Load team results and attempts
  useEffect(() => {
    if (session && myTeam) {
      const loadData = async () => {
        const [resultResponse, attemptsResponse] = await Promise.all([
          getYearGameTeamResults(session.id, myTeam.id),
          getYearGameTeamAttempts(session.id, myTeam.id, 5),
        ]);

        if (resultResponse.success) {
          setTeamResult(resultResponse.result);
        }

        if (attemptsResponse.success && attemptsResponse.attempts) {
          setRecentAttempts(attemptsResponse.attempts);
        }
      };

      loadData();
    }
  }, [session, myTeam]);

  // Real-time updates for game and team data
  useGameUpdates(game.id, (updatedGame) => {
    // Reload session when game updates
    const loadSession = async () => {
      const response = await getActiveYearGameSession(game.id);
      if (response.success && response.session) {
        setSession(response.session);
      }
    };
    loadSession();
  });

  useTeamUpdates(
    game.id,
    () => {
      // New team created - reload teams
      window.location.reload();
    },
    (updatedTeam) => {
      // Team updated - update my team if it's the same
      if (myTeam && updatedTeam.id === myTeam.id) {
        setMyTeam(updatedTeam as Team);
      }
    },
    () => {
      // Team deleted - reload teams
      window.location.reload();
    }
  );

  // Year Game specific real-time updates
  useYearGameSessionUpdates(game.id, (updatedSession) => {
    if (session && updatedSession.id === session.id) {
      setSession(updatedSession);
    }
  });

  useYearGameResultsUpdates(session?.id || "", (updatedResult) => {
    if (myTeam && updatedResult.team_id === myTeam.id) {
      setTeamResult(updatedResult);
    }
  });

  useYearGameAttemptsUpdates(session?.id || "", (newAttempt) => {
    if (myTeam && newAttempt.team_id === myTeam.id) {
      // Reload recent attempts
      const loadAttempts = async () => {
        const response = await getYearGameTeamAttempts(
          session!.id,
          myTeam!.id,
          5
        );
        if (response.success && response.attempts) {
          setRecentAttempts(response.attempts);
        }
      };
      loadAttempts();
    }
  });

  const handleSubmit = async () => {
    if (!expression.trim() || !session || !myTeam) {
      toast({
        title: "Error",
        description:
          "Please enter an expression and make sure you're in a team.",
        variant: "destructive",
      });
      return;
    }

    if (session.status !== "active") {
      toast({
        title: "Error",
        description: "The game is not currently active.",
        variant: "destructive",
      });
      return;
    }

    if (remainingTime <= 0) {
      toast({
        title: "Time's Up!",
        description: "The game has ended. No more submissions allowed.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await submitYearGameAttempt(
        session.id,
        myTeam.id,
        participant.id,
        expression.trim(),
        targetNumber
      );

      if (response.success && response.attempt) {
        if (response.attempt.isCorrect && response.isNewNumber) {
          toast({
            title: "Success!",
            description: `Great! You found ${targetNumber} = ${expression}`,
          });
          // Reload team results
          const resultResponse = await getYearGameTeamResults(
            session.id,
            myTeam.id
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
          myTeam.id,
          5
        );
        if (attemptsResponse.success && attemptsResponse.attempts) {
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

  const progressPercentage = session?.time_limit_seconds
    ? ((session.time_limit_seconds - remainingTime) /
        session.time_limit_seconds) *
      100
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
          <div>
            <h2 className="text-xl font-semibold">Loading Year Game...</h2>
            <p className="text-muted-foreground">
              Preparing your mathematical challenge
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="container mx-auto max-w-4xl">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No active Year Game session found. Please wait for the admin to
              start the game.
            </AlertDescription>
          </Alert>
          <Button
            onClick={() =>
              router.push(
                `/game/${game.id}/select?participant=${participant.id}`
              )
            }
            className="mt-4"
            variant="outline"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Game Selection
          </Button>
        </div>
      </div>
    );
  }

  const exampleExpressions = generateExampleExpressions(session.target_numbers);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="container mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Year Game</h1>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="default" className="text-lg px-4 py-2">
              {myTeam?.team_name || "No Team"}
            </Badge>
            <Badge variant="outline">{participant.nickname}</Badge>
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
              Your Team's Numbers
            </CardTitle>
            <CardDescription>
              Use ALL 4 numbers exactly once each to make expressions. Operations allowed: +, -, ×, ÷, ^, nPr, nCr
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
            <div className="mt-4 text-center">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> You must use all 4 numbers in your expression. 
                  Each number can only be used once.
                </AlertDescription>
              </Alert>
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
                  placeholder="Enter expression using all 4 numbers (e.g., 3 + 5 × 2 - 1)"
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

              {/* Operation examples */}
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Allowed Operations:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>• Basic: +, -, ×, ÷, ^</div>
                  <div>• Permutation: 5P2 (5 choose 2)</div>
                  <div>• Combination: 5C2 (5 choose 2)</div>
                  <div>• Parentheses: (3 + 2) × 4</div>
                </div>
              </div>

              {/* Example expressions */}
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Examples using all 4 numbers:</p>
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

        {/* Back Button */}
        <div className="text-center">
          <Button
            onClick={() =>
              router.push(
                `/game/${game.id}/select?participant=${participant.id}`
              )
            }
            variant="outline"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Game Selection
          </Button>
        </div>
      </div>
    </div>
  );
}
