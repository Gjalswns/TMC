"use client";

import { useState, useEffect, useCallback } from "react";
import { type Database, supabase } from "@/lib/supabase";
import { useGameUpdates, useParticipantUpdates } from "@/hooks/use-realtime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Users, Clock, Trophy, Loader2 } from "lucide-react";

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
      return "year-game"; // 기본값
  }
};

export function GameWaitingRoom({
  game: initialGame,
  participant,
}: GameWaitingRoomProps) {
  const [game, setGame] = useState(initialGame);
  const [participantCount, setParticipantCount] = useState(0);
  const [teamInfo, setTeamInfo] = useState<{
    teamName: string;
    teamMembers: string[];
  } | null>(null);
  const router = useRouter();

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

  // localStorage + 커스텀 이벤트를 이용한 즉시 통신
  useEffect(() => {
    let redirected = false;

    const redirect = () => {
      if (!redirected) {
        redirected = true;
        const targetGame = getGameRoute(game.current_round);
        console.log(`✅ Redirecting to ${targetGame}...`);
        window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
      }
    };

    // 1. localStorage 변경 감지 (크로스 탭)
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

    // 2. 커스텀 이벤트 리스닝 (같은 탭)
    const handleCustomEvent = (e: CustomEvent) => {
      if (e.detail.gameId === game.id) {
        console.log("✅ Game start detected via custom event!");
        redirect();
      }
    };

    // 3. 응급 브로드캐스트 채널
    const emergencyChannel = supabase
      .channel(`emergency-${game.id}`)
      .on('broadcast', { event: 'game_force_start' }, (payload) => {
        console.log('📡 Emergency broadcast received:', payload);
        if (payload.payload.gameId === game.id) {
          console.log("✅ Game start via emergency broadcast!");
          redirect();
        }
      })
      .subscribe();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('gameStarted', handleCustomEvent as EventListener);
    
    // 현재 탭에서도 주기적으로 체크 (하지만 게임 상태도 확인)
    const checkLocalStorage = async () => {
      if (redirected) return;
      const gameStarted = localStorage.getItem(`game-started-${game.id}`);
      const yearGameActive = localStorage.getItem(`year-game-active-${game.id}`);
      const forceRedirect = localStorage.getItem(`force-redirect-${game.id}`);
      
      if (gameStarted || yearGameActive || forceRedirect) {
        console.log("✅ Game start signal found in localStorage! Verifying...");
        
        // localStorage 신호가 있어도 실제 게임 상태 확인
        try {
          const { data: currentGame } = await supabase
            .from("games")
            .select("status, current_round")
            .eq("id", game.id)
            .single();
          
          if (currentGame && currentGame.status === "started" && currentGame.current_round >= 1) {
            console.log("✅ Game status verified via database! Redirecting...");
            redirect();
          } else {
            // 데이터베이스 업데이트가 실패했을 수도 있으니 localStorage의 상태 정보도 체크
            const gameStatusStr = localStorage.getItem(`game-status-${game.id}`);
            if (gameStatusStr) {
              try {
                const gameStatus = JSON.parse(gameStatusStr);
                if (gameStatus.status === "started" && gameStatus.current_round >= 1) {
                  console.log("✅ Game status verified via localStorage! Redirecting...");
                  redirect();
                  return;
                }
              } catch (parseError) {
                console.warn("Failed to parse game status from localStorage:", parseError);
              }
            }
            console.log("⚠️ localStorage signal found but game not actually started yet");
          }
        } catch (error) {
          console.error("Error verifying game status:", error);
          
          // 데이터베이스 조회 실패 시 localStorage 상태 정보로 대체
          const gameStatusStr = localStorage.getItem(`game-status-${game.id}`);
          if (gameStatusStr) {
            try {
              const gameStatus = JSON.parse(gameStatusStr);
              if (gameStatus.status === "started" && gameStatus.current_round >= 1) {
                console.log("✅ Game status verified via localStorage (DB failed)! Redirecting...");
                redirect();
              }
            } catch (parseError) {
              console.warn("Failed to parse game status from localStorage:", parseError);
            }
          }
        }
      }
    };

    const storageCheckInterval = setInterval(checkLocalStorage, 200); // 200ms마다 체크 (적당한 속도)

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('gameStarted', handleCustomEvent as EventListener);
      clearInterval(storageCheckInterval);
      supabase.removeChannel(emergencyChannel);
    };
  }, [game.id, participant?.id]);

  useEffect(() => {
    // Get initial participant count
    const getParticipantCount = async () => {
      const { count } = await supabase
        .from("participants")
        .select("*", { count: "exact", head: true })
        .eq("game_id", game.id);

      setParticipantCount(count || 0);
    };

    // Get team info if participant is assigned
    const getTeamInfo = async () => {
      if (participant?.team_id) {
        const { data: team } = await supabase
          .from("teams")
          .select("team_name")
          .eq("id", participant.team_id)
          .single();

        const { data: teammates } = await supabase
          .from("participants")
          .select("nickname")
          .eq("team_id", participant.team_id);

        if (team && teammates) {
          setTeamInfo({
            teamName: team.team_name,
            teamMembers: teammates.map((t) => t.nickname),
          });
        }
      }
    };

    getParticipantCount();
    getTeamInfo();
  }, [game.id, participant?.id, participant?.team_id]);

  // 다중 실시간 채널 리스닝
  useEffect(() => {
    console.log('🔔 Setting up multiple realtime channels for game updates...');

    // 1. 게임별 채널
    const gameChannel = supabase
      .channel(`game-${game.id}`)
      .on('broadcast', { event: 'year_game_started' }, (payload) => {
        console.log('📡 Received year_game_started broadcast:', payload);
        if (payload.payload.gameId === game.id) {
          const targetGame = getGameRoute(payload.payload.current_round || game.current_round);
          console.log(`✅ Game started via broadcast! Redirecting to ${targetGame}...`);
          window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'games',
        filter: `id=eq.${game.id}`
      }, (payload) => {
        console.log('🎮 Game updated via postgres_changes:', payload);
        const newGame = payload.new as Game;
        setGame(newGame);
        if (newGame.status === "started") {
          const targetGame = getGameRoute(newGame.current_round);
          console.log(`✅ Game started via postgres! Redirecting to ${targetGame}...`);
          window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
        }
      })
      .subscribe();

    // 2. 전체 게임 채널
    const globalChannel = supabase
      .channel('games')
      .on('broadcast', { event: 'year_game_started' }, (payload) => {
        console.log('📡 Received global year_game_started broadcast:', payload);
        if (payload.payload.gameId === game.id) {
          const targetGame = getGameRoute(payload.payload.current_round || game.current_round);
          console.log(`✅ Game started via global broadcast! Redirecting to ${targetGame}...`);
          window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
        }
      })
      .subscribe();

    // 3. Year Game 전용 채널
    const yearGameChannel = supabase
      .channel(`year-game-${game.id}`)
      .on('broadcast', { event: 'session_started' }, (payload) => {
        console.log('📡 Received year-game session_started broadcast:', payload);
        if (payload.payload.gameId === game.id) {
          const targetGame = getGameRoute(payload.payload.current_round || game.current_round);
          console.log(`✅ Game session started via dedicated broadcast! Redirecting to ${targetGame}...`);
          window.location.href = `/game/${game.id}/${targetGame}?participant=${participant?.id}`;
        }
      })
      .subscribe();

    return () => {
      console.log('🧹 Cleaning up realtime channels');
      supabase.removeChannel(gameChannel);
      supabase.removeChannel(globalChannel);
      supabase.removeChannel(yearGameChannel);
    };
  }, [game.id, participant?.id]);

  // Use the new realtime hooks (moved outside useEffect)
  const handleGameUpdate = useCallback(
    (updatedGame: any) => {
      const newGame = updatedGame as Game;
      console.log("Game updated in waiting room:", newGame);
      setGame(newGame);

      // Always redirect to Year Game when game starts
      if (newGame.status === "started") {
        const targetGame = getGameRoute(newGame.current_round);
        console.log(`Redirecting to ${targetGame}...`);
        window.location.href = `/game/${newGame.id}/${targetGame}?participant=${participant?.id}`;
      }
    },
    [router, participant?.id]
  );

  useGameUpdates(game.id, handleGameUpdate);

  // 초고속 폴링 + Year Game 세션 체크 (100ms 간격으로 더 빠르게)
  useEffect(() => {
    console.log('🔄 Starting ultra-fast polling for game status...');
    let redirected = false;
    let pollCount = 0;

    const pollInterval = setInterval(async () => {
      if (redirected) return; // 이미 리다이렉트했으면 중단
      
      pollCount++;
      console.log(`🔄 Poll #${pollCount} - Checking game status...`);

      try {
        // 1. 게임 상태 확인
        const { data: updatedGame } = await supabase
          .from("games")
          .select("*")
          .eq("id", game.id)
          .single();

        if (updatedGame) {
          console.log(`🎮 Game status: ${updatedGame.status}, Round: ${updatedGame.current_round}`);
          setGame(updatedGame);
          
          // 게임이 정말로 시작되었을 때만 리다이렉트 (더 엄격한 조건)
          if (updatedGame.status === "started" && updatedGame.current_round >= 1) {
            const targetGame = getGameRoute(updatedGame.current_round);
            console.log(`✅ Game started via polling! Redirecting to ${targetGame}...`);
            redirected = true;
            window.location.href = `/game/${updatedGame.id}/${targetGame}?participant=${participant?.id}`;
            return;
          }
        }

        // 2. 현재 라운드에 맞는 세션 체크 (ACTIVE 세션만)
        if (updatedGame && updatedGame.current_round >= 1) {
          let hasActiveSession = false;
          
          // Round 1: Year Game
          if (updatedGame.current_round === 1) {
            const { data: yearGameSessions } = await supabase
              .from("year_game_sessions")
              .select("status, game_id, id")
              .eq("game_id", game.id)
              .eq("status", "active");

            if (yearGameSessions && yearGameSessions.length > 0) {
              console.log(`✅ Active Year Game session found`);
              hasActiveSession = true;
            }
          }
          // Round 2: Score Steal
          else if (updatedGame.current_round === 2) {
            const { data: scoreStealSessions } = await supabase
              .from("score_steal_sessions")
              .select("status, game_id, id")
              .eq("game_id", game.id)
              .eq("status", "active");

            if (scoreStealSessions && scoreStealSessions.length > 0) {
              console.log(`✅ Active Score Steal session found`);
              hasActiveSession = true;
            }
          }
          // Round 3: Relay Quiz
          else if (updatedGame.current_round === 3) {
            const { data: relayQuizSessions } = await supabase
              .from("relay_quiz_sessions")
              .select("status, game_id, id")
              .eq("game_id", game.id)
              .eq("status", "active");

            if (relayQuizSessions && relayQuizSessions.length > 0) {
              console.log(`✅ Active Relay Quiz session found`);
              hasActiveSession = true;
            }
          }

          if (hasActiveSession) {
            const targetGame = getGameRoute(updatedGame.current_round);
            console.log(`✅ Game session is ACTIVE! Redirecting to ${targetGame}...`);
            redirected = true;
            window.location.href = `/game/${updatedGame.id}/${targetGame}?participant=${participant?.id}`;
            return;
          }
        }

        // 3. 참가자 수 업데이트 (매 5번째 폴링마다만)
        if (pollCount % 5 === 0) {
          const { count } = await supabase
            .from("participants")
            .select("*", { count: "exact", head: true })
            .eq("game_id", game.id);
          
          if (count !== null) {
            setParticipantCount(count);
          }

          // 4. 팀 정보 업데이트
          if (participant?.team_id) {
            const { data: team } = await supabase
              .from("teams")
              .select("team_name")
              .eq("id", participant.team_id)
              .single();

            const { data: teammates } = await supabase
              .from("participants")
              .select("nickname")
              .eq("team_id", participant.team_id);

            if (team && teammates) {
              setTeamInfo({
                teamName: team.team_name,
                teamMembers: teammates.map((t) => t.nickname),
              });
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 300); // 300ms마다 폴링 (빠른 반응이지만 적당한 수준)

    return () => {
      console.log('🧹 Stopping ultra-fast polling');
      clearInterval(pollInterval);
    };
  }, [game.id, participant?.id, participant?.team_id, router]);

  useParticipantUpdates(
    game.id,
    () => {
      // New participant joined
      const getParticipantCount = async () => {
        const { count } = await supabase
          .from("participants")
          .select("*", { count: "exact", head: true })
          .eq("game_id", game.id);
        setParticipantCount(count || 0);
      };
      getParticipantCount();
    },
    (updatedParticipant) => {
      // Participant updated (team assignment)
      if (updatedParticipant.id === participant?.id) {
        const getTeamInfo = async () => {
          if (participant?.team_id) {
            const { data: team } = await supabase
              .from("teams")
              .select("team_name")
              .eq("id", participant.team_id)
              .single();

            const { data: teammates } = await supabase
              .from("participants")
              .select("nickname")
              .eq("team_id", participant.team_id);

            if (team && teammates) {
              setTeamInfo({
                teamName: team.team_name,
                teamMembers: teammates.map((t) => t.nickname),
              });
            }
          }
        };
        getTeamInfo();
      }
    },
    () => {
      // Participant left
      const getParticipantCount = async () => {
        const { count } = await supabase
          .from("participants")
          .select("*", { count: "exact", head: true })
          .eq("game_id", game.id);
        setParticipantCount(count || 0);
      };
      getParticipantCount();
    }
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{game.title}</CardTitle>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
