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
  Send,
  Clock,
  Shield,
} from "lucide-react";
import {
  createScoreStealSession,
  startScoreStealSession,
  endScoreStealSession,
  createScoreStealQuestion,
  getScoreStealQuestions,
  getScoreStealSessionDetails,
  getSessionAttempts,
  getAvailableTargets,
  getProtectedTeams,
  broadcastQuestion,
  determineWinner,
} from "@/lib/score-steal-actions";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";

interface ScoreStealSession {
  id: string;
  game_id: string;
  round_number: number;
  status: "waiting" | "active" | "finished";
  phase: "waiting" | "question_active" | "waiting_for_target" | "completed";
  current_question_id?: string;
  question_broadcast_at?: string;
  winner_team_id?: string;
  started_at?: string;
  ended_at?: string;
  score_steal_questions?: {
    id: string;
    title: string;
    question_image_url: string;
    correct_answer: string;
    points: number;
  };
  teams?: {
    id: string;
    team_name: string;
    team_number: number;
  };
}

interface ScoreStealQuestion {
  id: string;
  title: string;
  question_image_url: string;
  correct_answer: string;
  points: number;
}

interface Team {
  id: string;
  team_name: string;
  team_number: number;
  score: number;
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
  const [protectedTeams, setProtectedTeams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLastRound, setIsLastRound] = useState(false);
  const { toast } = useToast();

  // Load session and data
  const loadData = useCallback(async () => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔄 [${timestamp}] [Score Steal Admin] Loading data...`);

    // Check if this is the last round AND if we're actually in Score Steal round
    const { data: gameData } = await supabase
      .from("games")
      .select("current_round, total_rounds")
      .eq("id", gameId)
      .single();

    if (gameData) {
      setIsLastRound(gameData.current_round >= gameData.total_rounds);

      // CRITICAL: Only load session if we're actually in Score Steal round (Round 2)
      if (gameData.current_round !== 2) {
        console.log(`⚠️ [${timestamp}] Skipping Score Steal session load - current round is ${gameData.current_round}, not 2`);
        return;
      }
    }

    // Check for existing session
    const { data: existingSession } = await supabase
      .from("score_steal_sessions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", currentRound)
      .single();

    if (existingSession) {
      console.log(`✅ [${timestamp}] Session found: ${existingSession.id}`);

      // Get full details
      const sessionRes = await getScoreStealSessionDetails(existingSession.id);
      if (sessionRes.success) {
        console.log(`📊 [${timestamp}] Session details:`, {
          id: sessionRes.session.id,
          phase: sessionRes.session.phase,
          status: sessionRes.session.status,
          current_question_id: sessionRes.session.current_question_id,
          has_question_data: !!sessionRes.session.score_steal_questions,
          question_title: sessionRes.session.score_steal_questions?.title
        });
        setSession({ ...sessionRes.session });
      }

      // Load attempts if session exists
      const attemptsRes = await getSessionAttempts(existingSession.id);
      if (attemptsRes.success) {
        console.log(`🎯 [${timestamp}] Attempts: ${attemptsRes.attempts.length} loaded`);
        setAttempts([...attemptsRes.attempts]);
      }
    } else {
      console.log(`ℹ️ [${timestamp}] No session found`);
      setSession(null);
    }

    // Load questions from central question management (score_steal category)
    const { data: centralQuestions, error: questionsError } = await supabase
      .from('central_questions')
      .select(`
        id,
        title,
        question_image_url,
        correct_answer,
        points,
        question_categories!inner(name)
      `)
      .eq('question_categories.name', 'score_steal')
      .eq('is_active', true)
      .order('created_at');

    if (!questionsError && centralQuestions) {
      console.log(`📝 [${timestamp}] Questions: ${centralQuestions.length} loaded`);
      setQuestions([...centralQuestions]);
    }

    // Load teams
    const teamsResult = await getAvailableTargets(gameId);
    if (teamsResult.success && teamsResult.teams) {
      console.log(`👥 [${timestamp}] Teams: ${teamsResult.teams.length} loaded`);
      setTeams([...teamsResult.teams]);
    }

    // Load protected teams
    const protectedRes = await getProtectedTeams(gameId, currentRound);
    if (protectedRes.success) {
      console.log(`🛡️ [${timestamp}] Protected teams: ${protectedRes.protectedTeams.length} loaded`);
      setProtectedTeams([...protectedRes.protectedTeams]);
    }

    console.log(`✅ [${timestamp}] [Score Steal Admin] All data loaded`);
  }, [gameId, currentRound]);

  // Initial load and continuous polling (faster for admin)
  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (isMounted) {
        await loadData();
      }
    };

    // Initial load
    poll();

    // Poll every 1 second for real-time admin updates
    pollInterval = setInterval(poll, 1000);

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [loadData]);

  const createNewSession = async () => {
    if (questions.length === 0) {
      toast({
        title: "문제가 필요합니다",
        description: "먼저 중앙 문제 관리에서 점수뺏기 문제를 추가해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log(`Creating score steal session for game ${gameId}, round ${currentRound}`);
      const result = await createScoreStealSession(gameId, currentRound);

      if (result.success) {
        console.log("Session created successfully:", result.sessionId);
        await loadData();
        toast({
          title: "세션 생성 완료",
          description: "점수 뺏기 세션이 생성되었습니다. 이제 게임을 시작할 수 있습니다.",
        });
      } else {
        console.error("Session creation failed:", result.error);
        toast({
          title: "세션 생성 실패",
          description: result.error || "알 수 없는 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Session creation error:", error);
      toast({
        title: "세션 생성 오류",
        description: "네트워크 오류가 발생했습니다. 다시 시도해주세요.",
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
        await loadData();
        toast({
          title: "게임 시작!",
          description: "점수 뺏기 게임이 시작되었습니다",
        });
        onGameUpdate?.();
      } else {
        toast({
          title: "오류",
          description: result.error || "게임 시작 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "게임 시작 실패",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async (advanceToNextRound: boolean = false) => {
    if (!session) return;

    setIsLoading(true);
    try {
      const result = await endScoreStealSession(session.id, advanceToNextRound);
      if (result.success) {
        toast({
          title: advanceToNextRound ? "다음 라운드로 이동" : "게임 종료",
          description: advanceToNextRound
            ? "점수뺏기 게임이 종료되었습니다. 이어게임으로 이동합니다..."
            : "점수뺏기 게임이 종료되었습니다.",
        });

        // Update parent component immediately
        if (advanceToNextRound) {
          // Force immediate update without reload
          onGameUpdate?.();
        } else {
          // Just reload data if not advancing
          await loadData();
          onGameUpdate?.();
        }
      } else {
        toast({
          title: "오류",
          description: result.error || "게임 종료 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "게임 종료 실패",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBroadcastQuestion = async (questionId: string) => {
    if (!session) {
      console.error("❌ No session available for broadcast");
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 [${timestamp}] [Admin] Broadcasting question ${questionId} to session ${session.id}`);

    setIsLoading(true);
    try {
      const result = await broadcastQuestion(session.id, questionId);
      console.log(`📊 [${timestamp}] [Admin] Broadcast result:`, result);

      if (result.success) {
        console.log(`✅ [${timestamp}] [Admin] Question broadcasted successfully, reloading data...`);
        await loadData();
        console.log(`✅ [${timestamp}] [Admin] Data reloaded after broadcast`);

        toast({
          title: "문제 공개!",
          description: "모든 팀에게 문제가 공개되었습니다",
        });
      } else {
        console.error(`❌ [${timestamp}] [Admin] Broadcast failed:`, result.error);
        toast({
          title: "오류",
          description: result.error || "문제 공개 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(`❌ [${timestamp}] [Admin] Broadcast exception:`, error);
      toast({
        title: "오류",
        description: "문제 공개 실패",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetQuestion = async () => {
    if (!session) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔄 [${timestamp}] [Admin] Resetting current question...`);

    setIsLoading(true);
    try {
      // 세션의 현재 문제를 초기화
      const { error: updateError } = await supabase
        .from('score_steal_sessions')
        .update({
          current_question_id: null,
          question_broadcast_at: null,
          phase: 'waiting'
        })
        .eq('id', session.id);

      if (updateError) {
        console.error(`❌ [${timestamp}] [Admin] Reset failed:`, updateError);
        throw updateError;
      }

      console.log(`✅ [${timestamp}] [Admin] Question reset successfully`);
      await loadData();

      toast({
        title: "문제 초기화 완료",
        description: "새로운 문제를 공개할 수 있습니다",
      });
    } catch (error) {
      console.error(`❌ [${timestamp}] [Admin] Reset exception:`, error);
      toast({
        title: "오류",
        description: "문제 초기화 실패",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDetermineWinner = async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const result = await determineWinner(session.id);
      if (result.success) {
        await loadData();
        toast({
          title: "승자 결정!",
          description: `${result.winnerTeamName}팀이 승리했습니다 (${result.responseTimeMs}ms)`,
        });
      } else {
        toast({
          title: "오류",
          description: result.error || "승자 결정 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "승자 결정 실패",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);
  const correctAttempts = attempts.filter((a) => a.is_correct);
  const winnerAttempt = attempts.find((a) => a.is_winner);

  return (
    <div className="space-y-6">
      {/* Game Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            점수뺏기 게임 설정 가이드
          </CardTitle>
          <CardDescription>
            게임을 시작하기 전에 다음 단계를 따라주세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${questions.length > 0 ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                1
              </div>
              <div className="flex-1">
                <p className="font-medium">문제 준비</p>
                <p className="text-sm text-muted-foreground">
                  중앙 문제 관리에서 점수뺏기 문제 추가 ({questions.length}개 준비됨)
                </p>
              </div>
              {questions.length > 0 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${session ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                2
              </div>
              <div className="flex-1">
                <p className="font-medium">세션 생성</p>
                <p className="text-sm text-muted-foreground">
                  점수뺏기 세션 생성 ({session ? '완료' : '대기 중'})
                </p>
              </div>
              {session ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${session?.status === 'active' ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                3
              </div>
              <div className="flex-1">
                <p className="font-medium">게임 시작</p>
                <p className="text-sm text-muted-foreground">
                  세션 시작 버튼 클릭 ({session?.status === 'active' ? '진행 중' : '대기 중'})
                </p>
              </div>
              {session?.status === 'active' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${session?.current_question_id ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                4
              </div>
              <div className="flex-1">
                <p className="font-medium">문제 공개</p>
                <p className="text-sm text-muted-foreground">
                  문제 선택 후 공개 버튼 클릭 ({session?.current_question_id ? '공개됨' : '대기 중'})
                </p>
              </div>
              {session?.current_question_id ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debug: Session State */}
      {session && (
        <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-700">
          <CardHeader>
            <CardTitle className="text-sm text-blue-900 dark:text-blue-100">🔍 세션 상태 (디버그)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1 font-mono text-blue-900 dark:text-blue-100">
              <div>ID: <span className="text-blue-700 dark:text-blue-300">{session.id}</span></div>
              <div>Status: <span className="font-bold text-blue-800 dark:text-blue-200">{session.status}</span></div>
              <div>Phase: <span className="font-bold text-blue-800 dark:text-blue-200">{session.phase}</span></div>
              <div>Current Question ID: <span className="font-bold text-blue-800 dark:text-blue-200">{session.current_question_id || 'null'}</span></div>
              <div>Has Question Data: <span className="font-bold text-blue-800 dark:text-blue-200">{session.score_steal_questions ? 'Yes' : 'No'}</span></div>
              {session.score_steal_questions && (
                <div>Question Title: <span className="font-bold text-blue-800 dark:text-blue-200">{session.score_steal_questions.title}</span></div>
              )}
              <div className="mt-2 pt-2 border-t border-blue-400 dark:border-blue-600">
                <div className="font-semibold mb-1">버튼 표시 조건:</div>
                <div>- status === 'active': <span className={session.status === 'active' ? 'text-green-700 dark:text-green-400 font-bold' : 'text-red-700 dark:text-red-400 font-bold'}>
                  {session.status === 'active' ? '✓' : '✗'}
                </span></div>
                <div>- !current_question_id: <span className={!session.current_question_id ? 'text-green-700 dark:text-green-400 font-bold' : 'text-red-700 dark:text-red-400 font-bold'}>
                  {!session.current_question_id ? '✓' : '✗'}
                </span></div>
                <div className="font-bold mt-1 text-blue-900 dark:text-blue-100">
                  → 공개 버튼: {session.status === 'active' && !session.current_question_id ? '표시됨 ✓' : '숨김 ✗'}
                </div>
                {session.current_question_id && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetQuestion}
                      disabled={isLoading}
                      className="w-full text-xs"
                    >
                      🔄 문제 초기화 (다시 공개하기)
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            점수 뺏기 게임 관리
          </CardTitle>
          <CardDescription>
            라운드 {currentRound} - Score Steal Game (시간 제한 없음)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <div className="space-y-4">
              {questions.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>세션을 생성할 수 없습니다!</strong><br />
                    먼저 중앙 문제 관리에서 점수뺏기 문제를 추가해주세요.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    문제가 준비되었습니다. 세션을 생성하여 게임을 시작하세요.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                onClick={createNewSession}
                disabled={isLoading || questions.length === 0}
              >
                {isLoading ? "생성 중..." : "점수 뺏기 세션 생성"}
              </Button>
              {questions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  세션을 생성하려면 최소 1개의 점수뺏기 문제가 필요합니다.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        session.status === "active"
                          ? "default"
                          : session.status === "finished"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {session.status === "waiting" && "대기 중"}
                      {session.status === "active" && "진행 중"}
                      {session.status === "finished" && "종료"}
                    </Badge>
                    <Badge variant="outline">
                      {session.phase === "waiting" && "문제 대기"}
                      {session.phase === "question_active" && "문제 진행 중"}
                      {session.phase === "waiting_for_target" && "타겟 선택 대기"}
                      {session.phase === "completed" && "완료"}
                    </Badge>
                  </div>
                  {session.winner_team_id && (
                    <p className="text-sm text-muted-foreground">
                      승자: {session.teams?.team_name}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {session.status === "waiting" && (
                    <Button onClick={startSession} disabled={isLoading}>
                      <Play className="h-4 w-4 mr-2" />
                      게임 시작
                    </Button>
                  )}
                  {session.status === "active" && (
                    <>
                      <Button
                        onClick={() => endSession(false)}
                        disabled={isLoading}
                        variant="outline"
                      >
                        <Square className="h-4 w-4 mr-2" />
                        게임 종료
                      </Button>
                      {!isLastRound && (
                        <Button
                          onClick={() => endSession(true)}
                          disabled={isLoading}
                          variant="default"
                        >
                          다음 라운드로
                        </Button>
                      )}
                    </>
                  )}
                  {session.status === "finished" && !isLastRound && (
                    <Button
                      onClick={() => endSession(true)}
                      disabled={isLoading}
                      variant="default"
                    >
                      다음 라운드로
                    </Button>
                  )}
                  {session.status === "finished" && isLastRound && (
                    <Badge variant="default" className="text-lg px-4 py-2">
                      🎉 모든 라운드 완료!
                    </Badge>
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
            문제 관리
          </CardTitle>
          <CardDescription>
            중앙 문제 관리에서 점수뺏기 문제를 선택합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>점수뺏기 문제가 없습니다!</strong><br />
                게임을 시작하기 전에 중앙 문제 관리에서 점수뺏기 카테고리에 문제를 추가해주세요.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                점수뺏기 문제 {questions.length}개가 준비되었습니다.
                문제를 추가하거나 수정하려면 중앙 문제 관리로 이동하세요.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {questions.length}개의 사용 가능한 문제
            </span>
            <Button
              onClick={() => window.open('/admin/questions', '_blank')}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              중앙 문제 관리로 이동
            </Button>
          </div>

          {/* Questions List */}
          <div className="space-y-2">
            {questions.map((question) => (
              <div
                key={question.id}
                className={`flex items-center justify-between p-3 border rounded-lg ${session?.current_question_id === question.id
                  ? "ring-2 ring-primary"
                  : ""
                  }`}
              >
                <div className="flex-1">
                  <p className="font-medium">{question.title}</p>
                  <p className="text-sm text-muted-foreground">
                    정답: {question.correct_answer}
                  </p>
                  {question.question_image_url && (
                    <div className="mt-2">
                      <img
                        src={question.question_image_url}
                        alt="문제 이미지"
                        className="w-32 h-20 object-cover rounded border cursor-pointer hover:opacity-80"
                        onClick={() => window.open(question.question_image_url, '_blank')}
                        title="클릭하여 크게 보기"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{question.points}점</Badge>
                  {session &&
                    session.status === "active" &&
                    !session.current_question_id && (
                      <Button
                        size="sm"
                        onClick={() => {
                          console.log(`🎯 [Admin] Broadcast button clicked for question: ${question.id}`);
                          handleBroadcastQuestion(question.id);
                        }}
                        disabled={isLoading}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        공개
                      </Button>
                    )}
                  {session?.current_question_id === question.id && (
                    <Badge>진행 중</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {questions.length === 0 && (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">점수뺏기 문제가 없습니다</h3>
              <p className="text-muted-foreground mb-4">
                중앙 문제 관리에서 점수뺏기 카테고리에 문제를 추가해주세요.
              </p>
              <Button
                onClick={() => window.open('/admin/questions', '_blank')}
                variant="outline"
              >
                중앙 문제 관리로 이동
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Protected Teams */}
      {protectedTeams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              보호된 팀
            </CardTitle>
            <CardDescription>
              이번 라운드에서 타겟이 될 수 없는 팀들
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {protectedTeams.map((pt: any) => (
                <div
                  key={pt.team_id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span className="font-medium">{pt.team_name}</span>
                  </div>
                  <Badge variant="outline">
                    {pt.reason === "victim_last_round" && "이전 라운드 피해자"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submission Status */}
      {session?.phase === "question_active" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              제출 현황
            </CardTitle>
            <CardDescription>
              {attempts.length}개 팀 제출 완료 • {correctAttempts.length}개 정답
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {attempts.map((attempt) => (
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
                      <p className="font-medium">{attempt.teams?.team_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {attempt.response_time_ms}ms
                      </p>
                    </div>
                  </div>
                  <Badge variant={attempt.is_correct ? "default" : "secondary"}>
                    {attempt.is_correct ? "정답" : "오답"}
                  </Badge>
                </div>
              ))}
            </div>

            {correctAttempts.length > 0 && !winnerAttempt && (
              <Button
                onClick={handleDetermineWinner}
                disabled={isLoading}
                className="w-full"
              >
                <Trophy className="h-4 w-4 mr-2" />
                승자 결정하기
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Winner Info */}
      {winnerAttempt && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Trophy className="h-5 w-5" />
              승자 결정!
            </CardTitle>
            <CardDescription>
              {winnerAttempt.teams?.team_name} • {winnerAttempt.response_time_ms}ms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Target className="h-4 w-4" />
              <AlertDescription>
                승자가 타겟을 선택하고 있습니다...
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Live Scoreboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            실시간 순위
          </CardTitle>
          <CardDescription>현재 팀 점수 및 순위</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedTeams.map((team, index) => (
              <div
                key={team.id}
                className={`flex items-center justify-between p-3 rounded-lg ${index === 0 ? "bg-yellow-50 border-yellow-200" : "bg-muted/50"
                  }`}
              >
                <div className="flex items-center gap-3">
                  {index === 0 && (
                    <Trophy className="h-5 w-5 text-yellow-500" />
                  )}
                  <span className="font-medium text-lg">#{index + 1}</span>
                  <span className="font-medium">{team.team_name}</span>
                  {protectedTeams.some((pt: any) => pt.team_id === team.id) && (
                    <Badge variant="secondary">
                      <Shield className="h-3 w-3 mr-1" />
                      보호됨
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{team.score}</div>
                  <div className="text-sm text-muted-foreground">점</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
