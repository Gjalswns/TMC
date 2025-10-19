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
    question_text: string;
    correct_answer: string;
    difficulty: string;
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
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const { toast } = useToast();

  // Form state for new question
  const [newQuestion, setNewQuestion] = useState({
    questionText: "",
    correctAnswer: "",
    difficulty: "easy" as "easy" | "medium" | "hard",
  });

  // Load session and data
  const loadData = useCallback(async () => {
    // Check for existing session
    const { data: existingSession } = await supabase
      .from("score_steal_sessions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round_number", currentRound)
      .single();

    if (existingSession) {
      // Get full details
      const sessionRes = await getScoreStealSessionDetails(existingSession.id);
      if (sessionRes.success) {
        setSession(sessionRes.session);
      }

      // Load attempts if session exists
      const attemptsRes = await getSessionAttempts(existingSession.id);
      if (attemptsRes.success) {
        setAttempts(attemptsRes.attempts);
      }
    } else {
      setSession(null);
    }

    // Load questions for current round
    const questionsResult = await getScoreStealQuestions(gameId, currentRound);
    if (questionsResult.success) {
      setQuestions(questionsResult.questions);
    }

    // Load teams
    const teamsResult = await getAvailableTargets(gameId);
    if (teamsResult.success) {
      setTeams(teamsResult.teams);
    }

    // Load protected teams
    const protectedRes = await getProtectedTeams(gameId, currentRound);
    if (protectedRes.success) {
      setProtectedTeams(protectedRes.protectedTeams);
    }
  }, [gameId, currentRound]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll for updates when game is active
  useEffect(() => {
    if (session?.phase === "question_active" || session?.phase === "waiting_for_target") {
      const interval = setInterval(() => {
        loadData();
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [session?.phase, loadData]);

  const createNewSession = async () => {
    setIsLoading(true);
    try {
      const result = await createScoreStealSession(gameId, currentRound);
      if (result.success) {
        await loadData();
        toast({
          title: "세션 생성 완료",
          description: "점수 뺏기 세션이 생성되었습니다",
        });
      } else {
        toast({
          title: "오류",
          description: result.error || "세션 생성 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "세션 생성 실패",
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

  const handleCreateQuestion = async () => {
    if (!newQuestion.questionText || !newQuestion.correctAnswer) {
      toast({
        title: "오류",
        description: "모든 필드를 입력해주세요",
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
          title: "문제 생성 완료",
          description: "새 문제가 추가되었습니다",
        });
      } else {
        toast({
          title: "오류",
          description: result.error || "문제 생성 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "문제 생성 실패",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBroadcastQuestion = async (questionId: string) => {
    if (!session) return;

    setIsLoading(true);
    try {
      const result = await broadcastQuestion(session.id, questionId);
      if (result.success) {
        await loadData();
        toast({
          title: "문제 공개!",
          description: "모든 팀에게 문제가 공개되었습니다",
        });
      } else {
        toast({
          title: "오류",
          description: result.error || "문제 공개 실패",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "문제 공개 실패",
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
      {/* Session Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            점수 뺏기 게임 관리
          </CardTitle>
          <CardDescription>
            라운드 {currentRound} - 실시간 경쟁 모드
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  이 라운드의 세션이 없습니다. 세션을 생성하여 게임을 시작하세요.
                </AlertDescription>
              </Alert>
              <Button onClick={createNewSession} disabled={isLoading}>
                {isLoading ? "생성 중..." : "점수 뺏기 세션 생성"}
              </Button>
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
            이 라운드의 문제를 관리합니다 (라운드당 1개 권장)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {questions.length}개의 문제
            </span>
            <Button
              onClick={() => setShowQuestionForm(!showQuestionForm)}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              문제 추가
            </Button>
          </div>

          {showQuestionForm && (
            <div className="space-y-4 p-4 border rounded-lg">
              <div>
                <Label htmlFor="questionText">문제</Label>
                <Textarea
                  id="questionText"
                  value={newQuestion.questionText}
                  onChange={(e) =>
                    setNewQuestion({
                      ...newQuestion,
                      questionText: e.target.value,
                    })
                  }
                  placeholder="문제를 입력하세요..."
                />
              </div>
              <div>
                <Label htmlFor="correctAnswer">정답</Label>
                <Input
                  id="correctAnswer"
                  value={newQuestion.correctAnswer}
                  onChange={(e) =>
                    setNewQuestion({
                      ...newQuestion,
                      correctAnswer: e.target.value,
                    })
                  }
                  placeholder="정답을 입력하세요..."
                />
              </div>
              <div>
                <Label htmlFor="difficulty">난이도</Label>
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
                    <SelectItem value="easy">쉬움 (10점)</SelectItem>
                    <SelectItem value="medium">보통 (20점)</SelectItem>
                    <SelectItem value="hard">어려움 (30점)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateQuestion} disabled={isLoading}>
                  {isLoading ? "생성 중..." : "문제 생성"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowQuestionForm(false)}
                >
                  취소
                </Button>
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-2">
            {questions.map((question) => (
              <div
                key={question.id}
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  session?.current_question_id === question.id
                    ? "ring-2 ring-primary"
                    : ""
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium">{question.question_text}</p>
                  <p className="text-sm text-muted-foreground">
                    정답: {question.correct_answer}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{question.difficulty}</Badge>
                  <Badge variant="secondary">{question.points}점</Badge>
                  {session?.status === "active" &&
                    session?.phase === "waiting" &&
                    !session?.current_question_id && (
                      <Button
                        size="sm"
                        onClick={() => handleBroadcastQuestion(question.id)}
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
