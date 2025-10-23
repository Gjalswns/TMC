"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  Play, 
  Copy, 
  Check, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  AlertCircle,
  Clock
} from "lucide-react";
import { useEnhancedRealtime } from "@/hooks/use-enhanced-realtime";
import { startGame, nextRound, updateTimeout } from "@/lib/game-actions";
import { type Database } from "@/lib/supabase";

type Game = Database["public"]["Tables"]["games"]["Row"];
type Team = Database["public"]["Tables"]["teams"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];

interface EnhancedGameDashboardProps {
  game: Game;
  teams: Team[];
  participants: Participant[];
}

export function EnhancedGameDashboard({
  game: initialGame,
  teams: initialTeams,
  participants: initialParticipants,
}: EnhancedGameDashboardProps) {
  const [game, setGame] = useState(initialGame);
  const [teams, setTeams] = useState(initialTeams);
  const [participants, setParticipants] = useState(initialParticipants);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [round1Timeout, setRound1Timeout] = useState(game.round1_timeout_seconds || 180);
  const router = useRouter();

  // Enhanced realtime connection
  const {
    connectionStatus,
    reconnect,
    broadcastEvent,
    isConnected,
    isReconnecting,
    lastError
  } = useEnhancedRealtime({
    gameId: game.id,
    onGameUpdate: (updatedGame) => {
      console.log("🎮 Game updated:", updatedGame);
      setGame(updatedGame);
    },
    onParticipantUpdate: (updatedParticipant) => {
      console.log("👤 Participant updated:", updatedParticipant);
      setParticipants(prev => 
        prev.map(p => p.id === updatedParticipant.id ? updatedParticipant : p)
      );
    },
    onTeamUpdate: (updatedTeam) => {
      console.log("🏆 Team updated:", updatedTeam);
      setTeams(prev => 
        prev.map(t => t.id === updatedTeam.id ? updatedTeam : t)
      );
    },
    onError: (error) => {
      console.error("❌ Realtime error:", error);
    },
    onReconnect: () => {
      console.log("✅ Reconnected to realtime");
    },
    fallbackInterval: 3000 // 3 second polling fallback
  });

  const copyGameCode = async () => {
    try {
      await navigator.clipboard.writeText(game.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.log("Game code:", game.join_code);
    }
  };

  const handleStartGame = async () => {
    setIsLoading(true);
    try {
      const result = await startGame(game.id);
      if (result.success) {
        // Broadcast custom event
        await broadcastEvent('game-started', {
          gameId: game.id,
          startedAt: new Date().toISOString()
        });
        
        setGame(prev => ({
          ...prev,
          status: "started",
          current_round: 1,
          started_at: new Date().toISOString(),
        }));
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error("Error starting game:", error);
      alert("Failed to start game");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextRound = async () => {
    setIsLoading(true);
    try {
      const result = await nextRound(game.id);
      if (result.success) {
        await broadcastEvent('round-changed', {
          gameId: game.id,
          newRound: result.round
        });
        
        setGame(prev => ({
          ...prev,
          current_round: result.round
        }));
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error("Error advancing round:", error);
      alert("Failed to advance round");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTimeout = async () => {
    setIsLoading(true);
    try {
      const result = await updateTimeout(game.id, round1Timeout);
      if (result.success) {
        await broadcastEvent('timeout-updated', {
          gameId: game.id,
          newTimeout: round1Timeout
        });
        
        setGame(prev => ({
          ...prev,
          round1_timeout_seconds: round1Timeout
        }));
        alert("Timeout updated successfully!");
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error("Error updating timeout:", error);
      alert("Failed to update timeout");
    } finally {
      setIsLoading(false);
    }
  };

  const unassignedParticipants = participants.filter((p) => !p.team_id);
  const assignedParticipants = participants.filter((p) => p.team_id);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-500" />
            )}
            실시간 연결 상태
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={isConnected ? "default" : "destructive"}>
                  {isConnected ? "연결됨" : "연결 끊김"}
                </Badge>
                {isReconnecting && (
                  <Badge variant="secondary">
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    재연결 중...
                  </Badge>
                )}
              </div>
              {lastError && (
                <p className="text-sm text-muted-foreground">
                  마지막 오류: {lastError}
                </p>
              )}
              {connectionStatus.reconnectAttempts > 0 && (
                <p className="text-sm text-muted-foreground">
                  재연결 시도: {connectionStatus.reconnectAttempts}/5
                </p>
              )}
            </div>
            {!isConnected && (
              <Button onClick={reconnect} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                수동 재연결
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Game Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{game.title}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{game.status}</Badge>
              <Button
                onClick={copyGameCode}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {game.join_code}
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Round {game.current_round} of {game.total_rounds}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <span>{participants.length} 참가자</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{game.round1_timeout_seconds || 180}초</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {teams.length} 팀
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game Controls */}
      <Card>
        <CardHeader>
          <CardTitle>게임 제어</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {game.status === "waiting" && (
              <Button
                onClick={handleStartGame}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                게임 시작
              </Button>
            )}
            
            {game.status === "in_progress" && game.current_round < (game.total_rounds || 4) && (
              <Button
                onClick={handleNextRound}
                disabled={isLoading}
                variant="outline"
              >
                다음 라운드
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="timeout" className="text-sm font-medium">
              라운드 1 타임아웃:
            </label>
            <input
              id="timeout"
              type="number"
              value={round1Timeout}
              onChange={(e) => setRound1Timeout(Number(e.target.value))}
              className="w-20 px-2 py-1 border rounded"
              min="60"
              max="600"
            />
            <span className="text-sm text-muted-foreground">초</span>
            <Button
              onClick={handleUpdateTimeout}
              disabled={isLoading}
              size="sm"
              variant="outline"
            >
              업데이트
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle>참가자 ({participants.length}명)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">팀 배정됨 ({assignedParticipants.length})</h4>
              <div className="space-y-1">
                {assignedParticipants.map((participant) => {
                  const team = teams.find((t) => t.id === participant.team_id);
                  return (
                    <div key={participant.id} className="flex items-center justify-between p-2 border rounded">
                      <span>{participant.nickname}</span>
                      <Badge variant="outline">{team?.team_name}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">팀 미배정 ({unassignedParticipants.length})</h4>
              <div className="space-y-1">
                {unassignedParticipants.map((participant) => (
                  <div key={participant.id} className="p-2 border rounded">
                    {participant.nickname}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Teams */}
      <Card>
        <CardHeader>
          <CardTitle>팀 점수</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {teams
              .sort((a, b) => b.score - a.score)
              .map((team) => {
                const teamParticipants = participants.filter((p) => p.team_id === team.id);
                return (
                  <div key={team.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{team.team_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {teamParticipants.length}명
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{team.score}</div>
                      <div className="text-sm text-muted-foreground">점</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
