"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { YearGameCalculator } from "./year-game-calculator";
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
// Realtime imports removed - using polling instead for stability
// import {
//   useGameUpdates,
//   useTeamUpdates,
//   useYearGameSessionUpdates,
//   useYearGameResultsUpdates,
//   useYearGameAttemptsUpdates,
// } from "@/hooks/use-realtime";

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

  // Load active session with aggressive polling
  useEffect(() => {
    let isMounted = true;
    let sessionFound = false;
    
    const loadSession = async () => {
      try {
        const response = await getActiveYearGameSession(game.id);
        
        if (!isMounted) return;
        
        if (response.success && response.session) {
          console.log("✅ Loaded active Year Game session:", response.session);
          setSession(response.session);
          sessionFound = true;
          setLoading(false);
        } else {
          console.log("⚠️ No active session found, will keep trying...");
        }
      } catch (error) {
        console.error("❌ Failed to load session:", error);
        if (isMounted && sessionFound) {
          toast({
            title: "오류",
            description: "세션 로드 중 오류가 발생했습니다",
            variant: "destructive",
          });
        }
      }
    };
    
    // 즉시 로드
    loadSession();
    
    // 세션을 찾을 때까지 계속 폴링 (500ms 간격)
    const sessionPollInterval = setInterval(() => {
      if (!sessionFound && isMounted) {
        console.log("🔄 Polling for Year Game session...");
        loadSession();
      } else {
        clearInterval(sessionPollInterval);
      }
    }, 500);
    
    // 10초 후에는 로딩 상태 해제 (타임아웃)
    const loadingTimeout = setTimeout(() => {
      if (isMounted && !sessionFound) {
        console.log("⏰ Session loading timeout");
        setLoading(false);
      }
    }, 10000);
    
    return () => {
      isMounted = false;
      clearInterval(sessionPollInterval);
      clearTimeout(loadingTimeout);
    };
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
        setRemainingTime((prev: number) => {
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

  // Load team results and attempts with aggressive polling for real-time updates
  useEffect(() => {
    if (!session || !myTeam) return;
    
    let isMounted = true;
    let errorCount = 0;
    const MAX_ERRORS = 3;
    
    const loadData = async () => {
      try {
        console.log(`📊 Loading team data for team ${myTeam.id}`);
        
        const [resultResponse, attemptsResponse] = await Promise.all([
          getYearGameTeamResults(session.id, myTeam.id),
          getYearGameTeamAttempts(session.id, myTeam.id, 5),
        ]);

        if (!isMounted) return;
        
        // Reset error count on success
        errorCount = 0;

        if (resultResponse.success && resultResponse.result) {
          setTeamResult(prev => {
            // Only update if changed to avoid unnecessary re-renders
            if (JSON.stringify(prev) !== JSON.stringify(resultResponse.result)) {
              console.log(`✅ Team results updated: ${resultResponse.result.total_found} numbers found`);
              return resultResponse.result;
            }
            return prev;
          });
        }

        if (attemptsResponse.success && attemptsResponse.attempts) {
          setRecentAttempts(prev => {
            // Only update if changed
            if (JSON.stringify(prev) !== JSON.stringify(attemptsResponse.attempts)) {
              console.log(`✅ Recent attempts updated: ${attemptsResponse.attempts.length} attempts`);
              return attemptsResponse.attempts;
            }
            return prev;
          });
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to load team data (${errorCount}/${MAX_ERRORS}):`, error);
        
        // Stop polling after too many errors
        if (errorCount >= MAX_ERRORS) {
          console.error("❌ Too many errors, stopping polling");
          if (isMounted) {
            toast({
              title: "연결 오류",
              description: "서버와의 연결이 끊어졌습니다. 페이지를 새로고침 해주세요.",
              variant: "destructive",
            });
          }
        }
      }
    };

    // Initial load
    loadData();
    
    // Ultra-fast polling for real-time feel (500ms for immediate updates)
    const refreshInterval = setInterval(() => {
      if (errorCount < MAX_ERRORS) {
        loadData();
      }
    }, 500); // 500ms로 더 빠르게
    
    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [session?.id, myTeam?.id]);

  // Realtime hooks removed - polling handles all updates now

  const handleCalculatorSubmit = async (expr: string, calculatedResult: number) => {
    if (!session || !myTeam) {
      toast({
        title: "Error",
        description: "Please make sure you're in a team.",
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
        expr,
        calculatedResult
      );

      console.log("📤 Submission response:", response);
      
      if (response.success && response.attempt) {
        if (response.attempt.isCorrect && response.isNewNumber) {
          console.log("✅ Correct answer! Updating team data...");
          toast({
            title: "Success!",
            description: `Great! You found ${calculatedResult} = ${expr}`,
          });
          
          // 즉시 Team Progress 업데이트 (여러 번 시도로 확실히 반영)
          const refreshTeamData = async () => {
            // 즉시 첫 번째 시도
            const resultResponse = await getYearGameTeamResults(session.id, myTeam.id);
            if (resultResponse.success && resultResponse.result) {
              setTeamResult(resultResponse.result);
            }
            
            const attemptsResponse = await getYearGameTeamAttempts(session.id, myTeam.id, 5);
            if (attemptsResponse.success && attemptsResponse.attempts) {
              setRecentAttempts(attemptsResponse.attempts);
            }

            // 500ms 후 두 번째 시도 (확실히 반영되도록)
            setTimeout(async () => {
              const resultResponse2 = await getYearGameTeamResults(session.id, myTeam.id);
              if (resultResponse2.success && resultResponse2.result) {
                setTeamResult(resultResponse2.result);
              }
              
              const attemptsResponse2 = await getYearGameTeamAttempts(session.id, myTeam.id, 5);
              if (attemptsResponse2.success && attemptsResponse2.attempts) {
                setRecentAttempts(attemptsResponse2.attempts);
              }
            }, 500);
          };
          
          // 즉시 새로고침 (비동기)
          refreshTeamData();
        } else if (response.attempt.isDuplicate) {
          // 구체적인 중복 오류 메시지
          toast({
            title: "❌ Already Found!",
            description: `Your team already found the number ${calculatedResult}. Try finding a different number between 1-100.`,
            variant: "destructive",
          });
        } else if (!response.attempt.isValid) {
          // 구체적인 유효성 오류 메시지
          toast({
            title: "❌ Invalid Expression!",
            description: `Expression validation failed. Check: All 4 numbers used exactly once, no extra numbers, valid syntax. Your numbers: ${session.target_numbers.join(", ")}`,
            variant: "destructive",
          });
        } else if (response.attempt.isCorrect && !response.isNewNumber) {
          // 정답이지만 이미 다른 팀이 찾은 경우
          toast({
            title: "⚠️ Already Found by Another Team!",
            description: `Your expression "${expr} = ${calculatedResult}" is correct, but another team already found this number.`,
            variant: "destructive",
          });
        } else {
          // 계산 오류
          toast({
            title: "❌ Calculation Error!",
            description: `Your expression "${expr}" doesn't equal ${calculatedResult}. Please check your calculation.`,
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
      } else {
        // 서버에서 반환된 구체적인 오류 처리
        const errorData = response as any;
        
        if (errorData.error_type === "session_inactive") {
          toast({
            title: "❌ Session Not Active!",
            description: "The game session is not currently active. Please wait for the teacher to start the game.",
            variant: "destructive",
          });
        } else if (errorData.error_type === "invalid_range") {
          toast({
            title: "❌ Invalid Range!",
            description: `Target number must be between 1 and 100. Your result: ${calculatedResult}`,
            variant: "destructive",
          });
        } else if (errorData.error_type === "invalid_numbers") {
          toast({
            title: "❌ Invalid Numbers Used!",
            description: `You used: ${errorData.invalid_numbers?.join(", ") || "unknown numbers"}. Allowed: ${errorData.allowed_numbers?.join(", ") || session.target_numbers.join(", ")}`,
            variant: "destructive",
          });
        } else if (errorData.error_type === "missing_numbers") {
          toast({
            title: "❌ Missing Numbers!",
            description: `You must use ALL numbers exactly once. Missing: ${errorData.missing_numbers?.join(", ")}. Required: ${errorData.required_numbers?.join(", ") || session.target_numbers.join(", ")}`,
            variant: "destructive",
          });
        } else if (errorData.error_type === "overused_numbers") {
          toast({
            title: "❌ Numbers Used Multiple Times!",
            description: `Each number can only be used once. Overused: ${errorData.overused_numbers?.join(", ")}. Required: ${errorData.required_numbers?.join(", ") || session.target_numbers.join(", ")}`,
            variant: "destructive",
          });
        } else if (errorData.error_type === "database_error") {
          toast({
            title: "❌ Database Error!",
            description: `A server error occurred while processing your submission. Please try again in a moment. Error: ${response.error}`,
            variant: "destructive",
          });
        } else {
          // 일반적인 오류
          let description = "";
          if (response.error?.includes("session")) {
            description = "Game session is not active or may have ended.";
          } else if (response.error?.includes("team")) {
            description = "Team assignment issue. You may not be properly assigned to a team.";
          } else {
            description = "Network connection issue or server temporarily unavailable.";
          }
          
          toast({
            title: "❌ Submission Failed!",
            description: `${description} Error: ${response.error || "Unknown error"}`,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      // 네트워크 오류 등
      toast({
        title: "❌ Connection Error!",
        description: `Failed to submit your attempt. Possible causes: Network connection lost, server down, or browser issue. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoize format time function to prevent recreation
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // Memoize progress percentage calculation
  const progressPercentage = useMemo(() => {
    if (!session?.time_limit_seconds) return 0;
    return ((session.time_limit_seconds - remainingTime) / session.time_limit_seconds) * 100;
  }, [session?.time_limit_seconds, remainingTime]);

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
    // 게임 상태에 따른 다른 메시지 표시
    const isGameStarted = game.status === "started" && game.current_round >= 1;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-blue-950 dark:via-indigo-950 dark:to-purple-950 p-4 flex items-center justify-center">
        <div className="container mx-auto max-w-2xl">
          <Card className="border-2 shadow-2xl">
            <CardContent className="p-12 text-center space-y-8">
              {/* Icon */}
              <div className="flex justify-center">
                <div className={`w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center ${
                  isGameStarted 
                    ? "from-orange-500 to-red-600 animate-pulse" 
                    : "from-blue-500 to-indigo-600 animate-pulse"
                }`}>
                  <Clock className="h-12 w-12 text-white" />
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <h1 className={`text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${
                  isGameStarted 
                    ? "from-orange-600 to-red-600" 
                    : "from-blue-600 to-indigo-600"
                }`}>
                  {isGameStarted ? "Loading Year Game..." : "Year Game is Starting Soon"}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {isGameStarted 
                    ? "The game has started! Loading your session..." 
                    : "Waiting for the admin to start Round 1..."
                  }
                </p>
              </div>

              {/* Info */}
              <div className="bg-muted/50 rounded-lg p-6 space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">{myTeam?.team_name || "No Team"}</span>
                  <Badge variant="outline">{participant.nickname}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isGameStarted 
                    ? "Please wait while we prepare your mathematical challenge..." 
                    : "Get ready! You'll need to create math expressions using 4 numbers."
                  }
                </p>
              </div>

              {/* Loading indicator */}
              <div className="flex items-center justify-center gap-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                  <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                </div>
                <span className="text-sm text-muted-foreground">Checking for updates...</span>
              </div>

              {/* Back button */}
              <Button
                onClick={() =>
                  router.push(
                    `/game/${game.id}/select?participant=${participant.id}`
                  )
                }
                variant="outline"
                size="lg"
                className="mt-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Game Selection
              </Button>
            </CardContent>
          </Card>
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
              {session.target_numbers.map((num: number, index: number) => (
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

        {/* 모바일 친화적 계산기 */}
        {session.status === "active" && (
          <YearGameCalculator
            availableNumbers={session.target_numbers}
            onSubmit={handleCalculatorSubmit}
            disabled={isSubmitting || remainingTime === 0}
          />
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
                Numbers found: {teamResult.total_found}/100 • Score:{" "}
                {teamResult.score}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-10 gap-1 mb-4">
                {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => (
                  <div
                    key={num}
                    className={`w-8 h-8 rounded text-xs flex items-center justify-center font-medium ${
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
                <strong>Found ({teamResult.total_found}):</strong> {teamResult.numbers_found.sort((a, b) => a - b).join(", ")}
              </div>
              <div className="mt-2 text-sm">
                <strong>Progress:</strong> {Math.round((teamResult.total_found / 100) * 100)}% complete
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
                {recentAttempts.map((attempt: YearGameAttempt) => (
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
