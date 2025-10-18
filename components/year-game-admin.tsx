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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Play,
  Square,
  Clock,
  Target,
  Trophy,
  Users,
  Calculator,
  BarChart3,
} from "lucide-react";
import {
  createYearGameSession,
  startYearGameSession,
  endYearGameSession,
  getYearGameSession,
} from "@/lib/year-game-actions";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import {
  useYearGameSessionUpdates,
  useYearGameResultsUpdates,
} from "@/hooks/use-realtime";

interface YearGameSession {
  id: string;
  game_id: string;
  round_number: number;
  target_numbers: number[];
  time_limit_seconds: number;
  status: "waiting" | "active" | "finished";
  started_at?: string;
  ended_at?: string;
  year_game_results?: Array<{
    id: string;
    team_id: string;
    numbers_found: number[];
    total_found: number;
    score: number;
    teams: {
      id: string;
      team_name: string;
      team_number: number;
      score: number;
    };
  }>;
}

interface YearGameAdminProps {
  gameId: string;
  currentRound: number;
  onGameUpdate?: () => void;
}

export function YearGameAdmin({
  gameId,
  currentRound,
  onGameUpdate,
}: YearGameAdminProps) {
  const [session, setSession] = useState<YearGameSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [customNumbers, setCustomNumbers] = useState<number[]>([1, 2, 3, 4]);
  const [showNumberInput, setShowNumberInput] = useState(false);
  const [numberInputs, setNumberInputs] = useState<number[]>([1, 2, 3, 4]);
  const { toast } = useToast();

  // Load existing session or create new one
  useEffect(() => {
    const loadSession = async () => {
      console.log(
        `🔍 Loading Year Game session for game ${gameId}, round ${currentRound}`
      );

      // Check if there's already an active session
      const { data: existingSession } = await supabase
        .from("year_game_sessions")
        .select("*")
        .eq("game_id", gameId)
        .eq("round_number", currentRound)
        .eq("status", "waiting")
        .single();

      if (existingSession) {
        console.log("✅ Found existing Year Game session:", existingSession);
        setSession(existingSession);
      } else {
        console.log("⚠️ No existing session found, creating new one...");
        // Create new session if none exists
        await createNewSession();
      }
    };
    loadSession();
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

  const handleNumberChange = (index: number, value: number) => {
    const newNumbers = [...numberInputs];
    newNumbers[index] = Math.max(0, Math.min(9, value)); // Ensure 0-9 range
    setNumberInputs(newNumbers);
  };

  const createNewSession = async () => {
    setIsLoading(true);
    try {
      console.log(
        `🆕 Creating new Year Game session for game ${gameId}, round ${currentRound}`
      );

      // Use the input numbers
      const numbersToUse = showNumberInput ? numberInputs : customNumbers;

      // Create session with custom numbers
      const { data: session, error } = await supabase
        .from("year_game_sessions")
        .insert({
          game_id: gameId,
          round_number: currentRound,
          target_numbers: numbersToUse,
          time_limit_seconds: 600, // 10 minutes
          status: "waiting",
        })
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Year Game session created successfully:", session);

      // Initialize results for all teams
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("game_id", gameId);

      if (teams && teams.length > 0) {
        const results = teams.map((team) => ({
          session_id: session.id,
          team_id: team.id,
          numbers_found: [],
          total_found: 0,
          score: 0,
        }));

        await supabase.from("year_game_results").insert(results);
      }

      setSession(session);
      toast({
        title: "Session Created",
        description: `Year Game session created with numbers: ${numbersToUse.join(
          ", "
        )}`,
      });
    } catch (error) {
      console.error("Error creating session:", error);
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
      const response = await startYearGameSession(session.id);
      if (response.success) {
        // Reload session data
        const sessionResponse = await getYearGameSession(session.id);
        if (sessionResponse.success) {
          setSession(sessionResponse.session);
        }
        toast({
          title: "Year Game Started!",
          description:
            "Round 1 has begun! Students can now submit mathematical expressions.",
        });
        onGameUpdate?.();
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to start session",
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
      const response = await endYearGameSession(session.id);
      if (response.success) {
        // Reload session data
        const sessionResponse = await getYearGameSession(session.id);
        if (sessionResponse.success) {
          setSession(sessionResponse.session);
        }
        toast({
          title: "Game Ended",
          description: "Year Game has ended. Check the final results.",
        });
        onGameUpdate?.();
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to end session",
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Real-time updates for session and results
  const handleSessionUpdate = useCallback(
    (updatedSession: any) => {
      console.log(
        "🎯 Year Game session updated via websocket:",
        updatedSession
      );
      if (updatedSession.id === session?.id) {
        setSession(updatedSession);
      }
    },
    [session?.id]
  );

  const handleResultsUpdate = useCallback(
    (updatedResult: any) => {
      console.log("📊 Year Game result updated via websocket:", updatedResult);
      if (session?.year_game_results) {
        const updatedResults = session.year_game_results.map((result) =>
          result.id === updatedResult.id ? updatedResult : result
        );
        setSession((prev) =>
          prev ? { ...prev, year_game_results: updatedResults } : null
        );
      }
    },
    [session?.year_game_results]
  );

  useYearGameSessionUpdates(gameId, handleSessionUpdate);
  useYearGameResultsUpdates(session?.id || "", handleResultsUpdate);

  const progressPercentage = session?.time_limit_seconds
    ? ((session.time_limit_seconds - remainingTime) /
        session.time_limit_seconds) *
      100
    : 0;

  const sortedResults =
    session?.year_game_results?.sort((a, b) => b.score - a.score) || [];

  if (!session) {
    return (
      <div className="space-y-6">
        {/* Number Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Year Game Setup
            </CardTitle>
            <CardDescription>
              Configure the 4 numbers that teams will use to create expressions. 
              Teams must use ALL numbers exactly once with operations: +, -, ×, ÷, ^, nPr, nCr
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>New Rules:</strong> Teams must use all 4 numbers exactly once each. 
                Each number can only be used once in the expression.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-4 gap-4">
              {numberInputs.map((number, index) => (
                <div key={index} className="space-y-2">
                  <Label htmlFor={`number-${index}`}>Number {index + 1}</Label>
                  <Input
                    id={`number-${index}`}
                    type="number"
                    min="0"
                    max="9"
                    value={number}
                    onChange={(e) => handleNumberChange(index, parseInt(e.target.value) || 0)}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Allowed Operations:</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div>• Basic: +, -, ×, ÷, ^</div>
                <div>• Permutation: 5P2</div>
                <div>• Combination: 5C2</div>
                <div>• Parentheses: (3 + 2) × 4</div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={createNewSession}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Creating..." : "Create Year Game Session"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Year Game Control
          </CardTitle>
          <CardDescription>
            Round {currentRound} - Manage the Year Game session
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Target Numbers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Team Numbers (Must Use All 4)</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNumberInput(!showNumberInput)}
              >
                {showNumberInput ? "Hide" : "Edit"} Numbers
              </Button>
            </div>

            {showNumberInput ? (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {session.target_numbers.map((num, index) => (
                  <Input
                    key={index}
                    type="number"
                    min="0"
                    max="9"
                    value={num}
                    onChange={async (e) => {
                      const newNumbers = [...session.target_numbers];
                      newNumbers[index] = parseInt(e.target.value) || 0;

                      // Update in database
                      const { error } = await supabase
                        .from("year_game_sessions")
                        .update({ target_numbers: newNumbers })
                        .eq("id", session.id);

                      if (!error) {
                        setSession({ ...session, target_numbers: newNumbers });
                      }
                    }}
                    className="text-center"
                  />
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                {session.target_numbers.map((num, index) => (
                  <div
                    key={index}
                    className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-lg font-bold"
                  >
                    {num}
                  </div>
                ))}
              </div>
            )}
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

          {/* Control Buttons */}
          <div className="flex gap-2">
            {session.status === "waiting" && (
              <Button
                onClick={startSession}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Start Game
              </Button>
            )}

            {session.status === "active" && (
              <Button
                onClick={endSession}
                disabled={isLoading}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                End Game
              </Button>
            )}

            {session.status === "finished" && (
              <Button
                onClick={createNewSession}
                disabled={isLoading}
                variant="outline"
              >
                New Session
              </Button>
            )}
          </div>

          {/* Status */}
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
        </CardContent>
      </Card>

      {/* Live Results */}
      {session.year_game_results && session.year_game_results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Live Results
            </CardTitle>
            <CardDescription>
              Real-time team progress and scores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedResults.map((result, index) => {
                const isWinning = index === 0 && result.score > 0;
                return (
                  <div
                    key={result.team_id}
                    className={`p-4 rounded-lg border ${
                      isWinning
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
                          {result.teams.team_name}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{result.score}</div>
                        <div className="text-sm text-muted-foreground">
                          points
                        </div>
                      </div>
                    </div>

                    <div className="mb-2">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Numbers Found: {result.total_found}/50</span>
                        <span>
                          {Math.round((result.total_found / 50) * 100)}%
                        </span>
                      </div>
                      <Progress
                        value={(result.total_found / 50) * 100}
                        className="h-2"
                      />
                    </div>

                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: 50 }, (_, i) => i + 1).map(
                        (num) => (
                          <div
                            key={num}
                            className={`w-6 h-6 rounded text-xs flex items-center justify-center font-medium ${
                              result.numbers_found.includes(num)
                                ? "bg-green-500 text-white"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {num}
                          </div>
                        )
                      )}
                    </div>

                    {result.numbers_found.length > 0 && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Found: {result.numbers_found.slice(0, 10).join(", ")}
                        {result.numbers_found.length > 10 &&
                          ` ... and ${result.numbers_found.length - 10} more`}
                      </div>
                    )}
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
            <Target className="h-5 w-5" />
            Game Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium">Objective</h4>
            <p className="text-sm text-muted-foreground">
              Teams must use the 4 target numbers exactly once each to create
              mathematical expressions that equal numbers from 1 to 50.
            </p>
          </div>

          <div>
            <h4 className="font-medium">Allowed Operations</h4>
            <p className="text-sm text-muted-foreground">
              + (addition), - (subtraction), × (multiplication), ÷ (division), ^
              (exponentiation), log (logarithm), ↑↑ (tetration), and
              parentheses.
            </p>
          </div>

          <div>
            <h4 className="font-medium">Scoring</h4>
            <p className="text-sm text-muted-foreground">
              Each number found = 1 point. Bonus points for consecutive number
              sequences.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
