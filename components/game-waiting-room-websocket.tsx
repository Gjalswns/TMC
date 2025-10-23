"use client";

import { useState, useEffect, useCallback } from "react";
import { type Database, supabase } from "@/lib/supabase";
import { useGameWaitingSocket } from "@/hooks/use-game-waiting-socket";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Users, Clock, Trophy, Loader2, Wifi, WifiOff } from "lucide-react";

type Game = Database["public"]["Tables"]["games"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];

interface GameWaitingRoomProps {
  game: Game;
  participant: Participant | null;
}

// 현재 라운드에 따른 게임 경로 결정
const getGameRoute = (currentRound: number) => {
  switch (currentRound) {
    case 0:
    case 1:
      return "year-game";
    case 2:
      return "score-steal";
    case 3:
      return "relay-quiz";
    default:
      return "year-game";
  }
};

export function GameWaitingRoom({
  game: initialGame,
  participant,
}: GameWaitingRoomProps) {
  const router = useRouter();
  
  // WebSocket 사용
  const { 
    game: wsGame, 
    participantCount, 
    teamInfo,
    isConnected,
    requestTeamInfo 
  } = useGameWaitingSocket(initialGame.id, participant?.id);

  // WebSocket에서 받은 게임 데이터 또는 초기 게임 데이터 사용
  const game = wsGame || initialGame;

  // 현재 라운드에 따른 대기 메시지 결정
  const getWaitingMessage = (currentRound: number) => {
    switch (currentRound) {
      case 0:
      case 1:
        return "Year Game is starting soon...";
      case 2:
        return "Score Steal Game is starting soon...";
      case 3:
        return "Relay Quiz is starting soon...";
      default:
        return "Next game is starting soon...";
    }
  };

  // 게임 시작 감지 및 리다이렉트
  useEffect(() => {
    if (!game) return;

    const timestamp = new Date().toLocaleTimeString();
    
    // 게임이 시작되면 즉시 리다이렉트
    if (game.status === "started" && game.current_round >= 1) {
      const targetGame = getGameRoute(game.current_round);
      console.log(`✅ [${timestamp}] Game started! Redirecting to ${targetGame}...`);
      window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
    }
  }, [game?.status, game?.current_round, game?.id, participant?.id]);

  // 팀 정보 요청 (참가자가 팀에 배정되었을 때)
  useEffect(() => {
    if (participant?.team_id && !teamInfo) {
      requestTeamInfo(participant.team_id);
    }
  }, [participant?.team_id, teamInfo, requestTeamInfo]);

  // localStorage + 커스텀 이벤트를 이용한 즉시 통신 (백업)
  useEffect(() => {
    let redirected = false;

    const redirect = () => {
      if (!redirected) {
        redirected = true;
        const targetGame = getGameRoute(game.current_round);
        console.log(`✅ Redirecting to ${targetGame} via backup mechanism...`);
        window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
      }
    };

    // localStorage 변경 감지 (크로스 탭)
    const handleStorageChange = (e: StorageEvent) => {
      const gameKeys = [
        `game-started-${game.id}`,
        `year-game-active-${game.id}`,
        `force-redirect-${game.id}`
      ];
      
      if (gameKeys.includes(e.key || "") && e.newValue) {
        console.log(`✅ Game start detected via localStorage (${e.key})!`);
        redirect();
      }
    };

    // 커스텀 이벤트 리스닝 (같은 탭)
    const handleCustomEvent = (e: CustomEvent) => {
      if (e.detail.gameId === game.id) {
        console.log("✅ Game start detected via custom event!");
        redirect();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('gameStarted', handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('gameStarted', handleCustomEvent as EventListener);
    };
  }, [game.id, game.current_round, participant?.id]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1" />
            <CardTitle className="text-2xl flex-1">{game.title}</CardTitle>
            <div className="flex-1 flex justify-end">
              {/* WebSocket 연결 상태 표시 */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Wifi className="h-4 w-4 text-green-500" />
                    <span className="text-xs text-green-600">실시간</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-red-600">연결 중...</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <CardDescription>{game.grade_class}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Game Status */}
          <div className="text-center">
            <Badge
              variant={game.status === "waiting" ? "secondary" : "default"}
              className="text-lg px-4 py-2"
            >
              {game.status === "waiting" ? "Waiting to Start" : "Game Started!"}
            </Badge>
          </div>

          {/* Participant Info */}
          {participant && (
            <Card>
              <CardContent className="p-4">
                <div className="text-center space-y-2">
                  <h3 className="font-medium">
                    Welcome, {participant.nickname}!
                  </h3>
                  {teamInfo ? (
                    <div className="space-y-2">
                      <Badge variant="outline" className="text-sm">
                        {teamInfo.teamName}
                      </Badge>
                      <div className="text-sm text-muted-foreground">
                        <p>Your teammates:</p>
                        <div className="flex flex-wrap gap-1 justify-center mt-1">
                          {teamInfo.teamMembers.map((member, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="text-xs"
                            >
                              {member}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Waiting for team assignment...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Game Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <Users className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-lg font-bold">{participantCount}</p>
              <p className="text-xs text-muted-foreground">Students</p>
            </div>
            <div className="space-y-1">
              <Clock className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-lg font-bold">{game.duration}</p>
              <p className="text-xs text-muted-foreground">Minutes</p>
            </div>
            <div className="space-y-1">
              <Trophy className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-lg font-bold">{game.team_count}</p>
              <p className="text-xs text-muted-foreground">Teams</p>
            </div>
          </div>

          {/* Waiting Message */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-muted-foreground">
                {getWaitingMessage(game.current_round)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep this page open. You'll be automatically redirected when the
              game begins.
            </p>
            {isConnected && (
              <p className="text-xs text-green-600">
                ✓ Real-time connection active
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
