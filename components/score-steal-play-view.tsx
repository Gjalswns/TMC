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
import {
  Target,
  Users,
  Trophy,
  AlertCircle,
  Clock,
  Zap,
  Shield,
  Sword,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  submitAnswerForRace,
  getScoreStealSessionDetails,
  getScoreStealSessionStatus,
  getSessionAttempts,
  getAvailableTargets,
  getProtectedTeams,
  executeScoreSteal,
} from "@/lib/score-steal-actions";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";

interface Team {
  id: string;
  team_name: string;
  team_number: number;
  score: number;
  bracket?: 'higher' | 'lower' | null;
}

interface ScoreStealPlayViewProps {
  gameId: string;
  currentRound: number;
  teamId: string;
  participantId: string;
  sessionId: string;
}

export function ScoreStealPlayView({
  gameId,
  currentRound,
  teamId,
  participantId,
  sessionId,
}: ScoreStealPlayViewProps) {
  const [session, setSession] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [protectedTeams, setProtectedTeams] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [answer, setAnswer] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [myAttempt, setMyAttempt] = useState<any>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const { toast } = useToast();

  // 단순하고 확실한 데이터 로딩
  const loadSessionData = useCallback(async () => {
    const timestamp = new Date().toLocaleTimeString();

    try {
      console.log(`📥 [${timestamp}] Loading session data for sessionId: ${sessionId}...`);

      // 1. 세션 데이터 로드 - 클라이언트에서 직접 쿼리 (캐시 방지)
      console.log(`🔍 [${timestamp}] Querying Supabase directly from client...`);
      const { data: rawSession, error: sessionError } = await supabase
        .from("score_steal_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionError) {
        console.error(`❌ [${timestamp}] Direct session query error:`, sessionError);
        return;
      }

      console.log(`📊 [${timestamp}] RAW Session from Supabase (direct):`, {
        id: rawSession.id,
        phase: rawSession.phase,
        status: rawSession.status,
        current_question_id: rawSession.current_question_id,
        question_broadcast_at: rawSession.question_broadcast_at,
        created_at: rawSession.created_at
      });

      // 현재 문제가 있다면 가져오기
      let sessionWithQuestion = rawSession;
      if (rawSession.current_question_id) {
        console.log(`🔍 [${timestamp}] Fetching question: ${rawSession.current_question_id}`);
        const { data: question, error: questionError } = await supabase
          .from('central_questions')
          .select('id, title, question_image_url, correct_answer, points')
          .eq('id', rawSession.current_question_id)
          .single();

        if (questionError) {
          console.error(`❌ [${timestamp}] Question fetch error:`, questionError);
        } else if (question) {
          console.log(`✅ [${timestamp}] Question loaded:`, {
            id: question.id,
            title: question.title,
            hasImage: !!question.question_image_url
          });
          sessionWithQuestion = {
            ...rawSession,
            score_steal_questions: question
          };
        }
      }

      // 세션 데이터 로그
      console.log(`📊 [${timestamp}] Final Session Data:`, {
        id: sessionWithQuestion.id,
        phase: sessionWithQuestion.phase,
        status: sessionWithQuestion.status,
        current_question_id: sessionWithQuestion.current_question_id,
        has_question_data: !!sessionWithQuestion.score_steal_questions,
        question_title: sessionWithQuestion.score_steal_questions?.title,
        question_image: sessionWithQuestion.score_steal_questions?.question_image_url,
        broadcast_at: sessionWithQuestion.question_broadcast_at,
        created_at: sessionWithQuestion.created_at
      });

      // 세션 상태 업데이트 - 강제로 새 객체 생성하여 React 리렌더링 트리거
      const newSession = { ...sessionWithQuestion };
      setSession(newSession);
      console.log(`✅ [${timestamp}] Session state updated in React. New phase: ${newSession.phase}`);

      // 추가 검증: phase가 question_active인데 문제가 없으면 경고
      if (newSession.phase === 'question_active' && !newSession.score_steal_questions) {
        console.warn(`⚠️ [${timestamp}] Phase is 'question_active' but no question data!`);
      }

      // 2. 팀 데이터 로드
      const teamsRes = await getAvailableTargets(gameId);
      if (teamsRes.success && teamsRes.teams) {
        const myTeam = teamsRes.teams.find((t: any) => t.id === teamId);
        const myBracket = myTeam?.bracket;

        const filteredTeams = teamsRes.teams.filter((t: any) => {
          if (!myBracket) return true;
          return t.bracket === myBracket;
        });

        console.log(`👥 [${timestamp}] Teams: ${filteredTeams.length} loaded`);
        setTeams([...filteredTeams]);
      }

      // 3. 보호된 팀 로드
      const protectedRes = await getProtectedTeams(gameId, currentRound);
      if (protectedRes.success) {
        setProtectedTeams([...protectedRes.protectedTeams.map((p: any) => p.team_id)]);
      }

      // 4. 시도 기록 로드
      const attemptsRes = await getSessionAttempts(sessionId);
      if (attemptsRes.success) {
        console.log(`🎯 [${timestamp}] Attempts: ${attemptsRes.attempts.length} loaded`);
        setAttempts([...attemptsRes.attempts]);

        // 내 팀의 제출 여부 확인
        const myTeamAttempt = attemptsRes.attempts.find(
          (a: any) => a.team_id === teamId
        );
        if (myTeamAttempt) {
          console.log(`✅ [${timestamp}] My team submitted:`, myTeamAttempt);
          setHasSubmitted(true);
          setMyAttempt({ ...myTeamAttempt });
        } else {
          setHasSubmitted(false);
          setMyAttempt(null);
        }
      }

      console.log(`✅ [${timestamp}] All data loaded successfully`);

    } catch (error) {
      console.error(`❌ [${timestamp}] Load session data error:`, error);
    }
  }, [sessionId, gameId, currentRound, teamId]);

  // 세션 상태 변경 감지
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔔 [${timestamp}] [STATE CHANGE] Session state updated:`, {
      phase: session?.phase,
      status: session?.status,
      current_question_id: session?.current_question_id,
      hasQuestion: !!session?.score_steal_questions,
      questionTitle: session?.score_steal_questions?.title
    });
  }, [session?.phase, session?.status, session?.current_question_id, session?.score_steal_questions]);

  // 실시간 업데이트: Socket.IO 우선, 폴링은 백업
  useEffect(() => {
    setSseConnected(true);
    let pollCount = 0;
    let pollInterval: NodeJS.Timeout | null = null;

    console.log(`🔧 Starting real-time updates for session: ${sessionId}`);

    const poll = async () => {
      pollCount++;
      const timestamp = new Date().toLocaleTimeString();

      console.log(`🔄 [${timestamp}] Poll #${pollCount} - Loading data...`);

      try {
        await loadSessionData();
        console.log(`✅ [${timestamp}] Poll #${pollCount} completed`);
      } catch (error) {
        console.error(`❌ [${timestamp}] Poll #${pollCount} failed:`, error);
      }
    };

    // 즉시 한 번 실행
    poll();

    // 1초마다 폴링 (Socket.IO가 실패할 경우를 대비한 백업)
    pollInterval = setInterval(poll, 1000);

    return () => {
      console.log(`🔌 Stopping updates for session: ${sessionId}`);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [sessionId, loadSessionData]);

  // Monitor game round changes and redirect to next game
  useEffect(() => {
    let isMounted = true;

    const checkGameRound = async () => {
      try {
        const { data: gameData } = await supabase
          .from("games")
          .select("current_round, status")
          .eq("id", gameId)
          .single();

        if (!isMounted || !gameData) return;

        // If game round changed from 2, redirect to appropriate game
        if (gameData.current_round !== 2 && gameData.status === "started") {
          console.log(`🎮 Game round changed to ${gameData.current_round}, redirecting...`);

          if (gameData.current_round === 3) {
            console.log(`🚀 Redirecting to relay-quiz...`);
            window.location.href = `/game/${gameId}/relay-quiz?participant=${participantId}`;
          }
        }
      } catch (error) {
        console.error("❌ Failed to check game round:", error);
      }
    };

    // Check immediately
    checkGameRound();

    // Poll every 2 seconds
    const roundCheckInterval = setInterval(() => {
      if (isMounted) {
        checkGameRound();
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(roundCheckInterval);
    };
  }, [gameId, participantId]);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  // 초기 데이터 로드
  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !session?.score_steal_questions) {
      toast({
        title: "오류",
        description: "정답을 입력해주세요",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitAnswerForRace(
        sessionId,
        teamId,
        answer.trim(),
        session.question_broadcast_at
      );

      if (result.success) {
        setHasSubmitted(true);
        setMyAttempt({
          is_correct: result.isCorrect,
          response_time_ms: result.responseTimeMs,
        });

        toast({
          title: result.isCorrect ? "정답!" : "오답",
          description: result.isCorrect
            ? `응답 시간: ${result.responseTimeMs}ms`
            : "아쉽게도 틀렸습니다",
          variant: result.isCorrect ? "default" : "destructive",
        });

        // Reload to see all attempts
        await loadSessionData();
      } else {
        toast({
          title: "오류",
          description: result.error || "제출 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "정답 제출 중 오류가 발생했습니다",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectTarget = async () => {
    if (!selectedTarget || !session) {
      toast({
        title: "오류",
        description: "타겟 팀을 선택해주세요",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await executeScoreSteal(
        sessionId,
        selectedTarget
      );

      if (result.success) {
        toast({
          title: "점수 뺏기 성공!",
          description: `${result.pointsStolen}점을 획득했습니다!`,
        });

        await loadSessionData();
      } else {
        toast({
          title: "오류",
          description: result.error || "점수 뺏기 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "점수 뺏기 중 오류가 발생했습니다",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);
  const winnerAttempt = attempts.find((a) => a.is_winner);
  const isWinner = winnerAttempt?.team_id === teamId;
  const correctAttempts = attempts.filter((a) => a.is_correct);

  // Debug logging - 렌더링 시점 확인
  const renderTimestamp = new Date().toLocaleTimeString();
  console.log(`🎨 [${renderTimestamp}] [RENDER] Score Steal Play View:`, {
    sessionId,
    hasSession: !!session,
    phase: session?.phase,
    status: session?.status,
    current_question_id: session?.current_question_id,
    hasQuestion: !!session?.score_steal_questions,
    questionTitle: session?.score_steal_questions?.title,
    questionImage: session?.score_steal_questions?.question_image_url,
    hasSubmitted,
    myAttemptId: myAttempt?.id,
    attemptsCount: attempts.length
  });

  // Phase rendering
  if (!session) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
              <p>로딩 중...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Waiting for question
  if (session.phase === "waiting") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sword className="h-5 w-5" />
              점수 뺏기 게임
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="default" className="flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  실시간 업데이트
                </Badge>
              </div>
            </CardTitle>
            <CardDescription>라운드 {currentRound}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                관리자가 문제를 공개할 때까지 기다려주세요... (실시간 업데이트 활성화됨)
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Scoreboard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              현재 순위
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedTeams.map((team, index) => (
                <div
                  key={team.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${index === 0
                    ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700"
                    : "bg-muted/50 border-transparent"
                    } ${team.id === teamId ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {index === 0 && <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />}
                    <span className="font-medium text-lg">#{index + 1}</span>
                    <span className="font-medium">{team.team_name}</span>
                    {team.id === teamId && <Badge>우리 팀</Badge>}
                    {protectedTeams.includes(team.id) && (
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

  // Question active - answer input
  if (session.phase === "question_active" && !hasSubmitted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              빠른 정답을 입력하세요!
            </CardTitle>
            <CardDescription>가장 먼저 정답을 맞춘 팀이 승리합니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              {session.score_steal_questions?.question_image_url ? (
                <>
                  <h4 className="font-medium mb-3 text-center">문제:</h4>
                  <div className="mb-4 flex justify-center">
                    <img
                      src={session.score_steal_questions.question_image_url}
                      alt="문제 이미지"
                      className="max-w-full max-h-96 rounded-lg border-2 border-border shadow-lg object-contain"
                      onError={(e) => {
                        console.error('이미지 로드 실패:', session.score_steal_questions.question_image_url);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  {session.score_steal_questions?.title && (
                    <p className="text-lg text-center mt-2">{session.score_steal_questions.title}</p>
                  )}
                </>
              ) : (
                <>
                  <h4 className="font-medium mb-2">문제:</h4>
                  <p className="text-lg">{session.score_steal_questions?.title || '문제를 불러오는 중...'}</p>
                </>
              )}
              <div className="flex gap-2 mt-3 justify-center">
                <Badge variant="secondary">
                  {session.score_steal_questions?.points}점
                </Badge>
              </div>
            </div>

            <div>
              <Label htmlFor="answer">정답</Label>
              <Input
                id="answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="정답을 입력하세요..."
                onKeyPress={(e) => e.key === "Enter" && handleSubmitAnswer()}
                autoFocus
              />
            </div>

            <Button
              onClick={handleSubmitAnswer}
              disabled={isSubmitting || !answer.trim()}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? "제출 중..." : "제출하기"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Submitted - waiting for results
  if (session.phase === "question_active" && hasSubmitted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>제출 완료</CardTitle>
            <CardDescription>다른 팀의 응답을 기다리는 중...</CardDescription>
          </CardHeader>
          <CardContent>
            {myAttempt && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {myAttempt.is_correct
                    ? `정답입니다! 응답 시간: ${myAttempt.response_time_ms}ms`
                    : "아쉽게도 틀렸습니다"}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Submission Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              제출 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{attempt.teams?.team_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {attempt.response_time_ms}ms
                    </p>
                  </div>
                  <Badge variant={attempt.is_correct ? "default" : "secondary"}>
                    {attempt.is_correct ? "정답" : "오답"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Winner selection phase
  if (session.phase === "waiting_for_target") {
    const winnerTeamName = winnerAttempt?.teams?.team_name || "승자";

    if (isWinner) {
      // Winner selects target
      const availableTargets = sortedTeams.filter(
        (t) => !protectedTeams.includes(t.id)
      );

      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <Trophy className="h-6 w-6" />
                승리!
              </CardTitle>
              <CardDescription>
                응답 시간: {winnerAttempt?.response_time_ms}ms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Target className="h-4 w-4" />
                <AlertDescription>
                  점수를 뺏을 팀을 선택하세요. 보호된 팀은 선택할 수 없습니다.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>타겟 선택</CardTitle>
              <CardDescription>
                {session.score_steal_questions?.points}점을 뺏을 수 있습니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="target">타겟 팀</Label>
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="타겟 팀을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTargets.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.team_name} ({team.score}점)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleSelectTarget}
                disabled={isSubmitting || !selectedTarget}
                className="w-full"
                size="lg"
              >
                {isSubmitting ? "처리 중..." : "점수 뺏기"}
              </Button>
            </CardContent>
          </Card>

          {/* Protected teams info */}
          {protectedTeams.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  보호된 팀
                </CardTitle>
                <CardDescription>
                  이번 라운드에서 선택할 수 없는 팀들
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {teams
                    .filter((t) => protectedTeams.includes(t.id))
                    .map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-2 p-2 rounded bg-muted/50"
                      >
                        <Shield className="h-4 w-4" />
                        <span>{team.team_name}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      );
    } else {
      // Other teams wait
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                승자: {winnerTeamName}
              </CardTitle>
              <CardDescription>
                응답 시간: {winnerAttempt?.response_time_ms}ms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  승자가 타겟을 선택하는 중입니다...
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <CardTitle>제출 결과</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {correctAttempts.map((attempt, index) => (
                  <div
                    key={attempt.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${attempt.is_winner
                      ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700"
                      : "bg-muted/50 border-transparent"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      {attempt.is_winner && (
                        <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      )}
                      <span className="font-medium">#{index + 1}</span>
                      <span>{attempt.teams?.team_name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {attempt.response_time_ms}ms
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  // Completed
  if (session.phase === "completed") {
    const winnerTeamName = winnerAttempt?.teams?.team_name || "승자";

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              라운드 완료!
            </CardTitle>
            <CardDescription>승자: {winnerTeamName}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                다음 라운드를 기다려주세요
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Final Scoreboard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              최종 순위
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedTeams.map((team, index) => (
                <div
                  key={team.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${index === 0
                    ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700"
                    : "bg-muted/50 border-transparent"
                    } ${team.id === teamId ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {index === 0 && <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />}
                    <span className="font-medium text-lg">#{index + 1}</span>
                    <span className="font-medium">{team.team_name}</span>
                    {team.id === teamId && <Badge>우리 팀</Badge>}
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

  return null;
}
