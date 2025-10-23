"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { AlertCircle, CheckCircle } from "lucide-react";

type PreregisteredPlayer = {
  id: string;
  player_name: string;
  player_number: number | null;
  team_name: string;
  bracket: 'higher' | 'lower';
  is_active: boolean;
};

export default function JoinGameWithCode({
  game,
}: {
  game: { 
    id: string;
    game_code: string;
    title: string; 
    max_participants?: number;
    currentParticipants?: number;
    remainingSlots?: number;
    isJoinable?: boolean;
    status?: string;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [availablePlayers, setAvailablePlayers] = useState<PreregisteredPlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  // Load all active players (no check-in validation)
  useEffect(() => {
    const loadPlayers = async () => {
      setLoadingPlayers(true);
      try {
        // Get all preregistered players - no filtering by check-in status
        const { data: allPlayers, error } = await supabase
          .from("preregistered_players")
          .select("*")
          .eq("is_active", true);

        if (error) throw error;

        // Sort by team name (lexicographic), then by player number
        const sortedPlayers = (allPlayers || []).sort((a, b) => {
          // First sort by team name
          const teamCompare = a.team_name.localeCompare(b.team_name);
          if (teamCompare !== 0) return teamCompare;
          
          // Then sort by player number (nulls last)
          if (a.player_number === null && b.player_number === null) return 0;
          if (a.player_number === null) return 1;
          if (b.player_number === null) return -1;
          return a.player_number - b.player_number;
        });

        setAvailablePlayers(sortedPlayers);
      } catch (error) {
        console.error("Failed to load players:", error);
        toast({
          title: "오류",
          description: "학생 명단을 불러오는데 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadPlayers();
  }, [game.id, toast]);

  const handleJoin = async () => {
    console.log("🎮 Join button clicked", { selectedPlayerId, gameId: game.id });
    
    if (!selectedPlayerId) {
      toast({
        title: "오류",
        description: "명단에서 본인 이름을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const selectedPlayer = availablePlayers.find(p => p.id === selectedPlayerId);
      console.log("👤 Selected player:", selectedPlayer);
      
      if (!selectedPlayer) {
        throw new Error("선택한 학생을 찾을 수 없습니다.");
      }

      // Get the team that matches this player's team_name
      console.log("🔍 Looking for team:", selectedPlayer.team_name);
      
      // First get all teams for this game, then filter by team_name
      // This avoids URL encoding issues with special characters
      const { data: allTeams, error: teamError } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("game_id", game.id);

      console.log("🏆 All teams query result:", { allTeams, teamError });

      if (teamError) {
        console.error("❌ Failed to fetch teams:", teamError);
        throw new Error("팀 정보를 가져오는데 실패했습니다.");
      }

      // If no teams exist, create them from preregistered players
      if (!allTeams || allTeams.length === 0) {
        console.log("⚠️ No teams found, creating teams from preregistered players...");
        
        // Get unique teams from preregistered players
        const { data: preregisteredPlayers, error: playersError } = await supabase
          .from("preregistered_players")
          .select("team_name, bracket")
          .eq("is_active", true);

        if (playersError) {
          console.error("❌ Failed to fetch preregistered players:", playersError);
          throw new Error("사전 등록된 학생 정보를 가져오는데 실패했습니다.");
        }

        // Create unique teams
        const uniqueTeams = new Map<string, { team_name: string; bracket: 'higher' | 'lower' }>();
        preregisteredPlayers?.forEach(player => {
          if (!uniqueTeams.has(player.team_name)) {
            uniqueTeams.set(player.team_name, {
              team_name: player.team_name,
              bracket: player.bracket
            });
          }
        });

        // Convert to array and add team numbers
        const teamsToCreate = Array.from(uniqueTeams.values()).map((team, index) => ({
          game_id: game.id,
          team_name: team.team_name,
          team_number: index + 1,
          bracket: team.bracket,
        }));

        if (teamsToCreate.length === 0) {
          throw new Error("사전 등록된 학생이 없습니다. 관리자에게 문의하세요.");
        }

        console.log("➕ Creating teams:", teamsToCreate);
        const { data: createdTeams, error: createError } = await supabase
          .from("teams")
          .insert(teamsToCreate)
          .select("id, team_name");

        if (createError) {
          console.error("❌ Failed to create teams:", createError);
          throw new Error("팀 생성에 실패했습니다.");
        }

        console.log("✅ Teams created:", createdTeams);
        
        // Update allTeams with newly created teams
        const { data: refreshedTeams } = await supabase
          .from("teams")
          .select("id, team_name")
          .eq("game_id", game.id);
        
        if (refreshedTeams) {
          allTeams.push(...refreshedTeams);
        }
      }

      // Find the matching team by name
      const matchingTeam = allTeams?.find(team => team.team_name === selectedPlayer.team_name);
      
      console.log("🎯 Matching team:", matchingTeam);

      if (!matchingTeam) {
        console.error("❌ Team not found in results:", { 
          searchingFor: selectedPlayer.team_name,
          availableTeams: allTeams?.map(t => t.team_name)
        });
        throw new Error(`해당 팀을 찾을 수 없습니다: ${selectedPlayer.team_name}`);
      }

      // Check if participant already exists for this game
      console.log("🔍 Checking existing participant...");
      const { data: existingParticipant, error: participantError } = await supabase
        .from("participants")
        .select("id")
        .eq("game_id", game.id)
        .eq("preregistered_player_id", selectedPlayerId)
        .maybeSingle();

      console.log("👥 Existing participant:", { existingParticipant, participantError });

      let participantId: string;

      if (existingParticipant) {
        // Use existing participant
        participantId = existingParticipant.id;
        console.log("✅ Using existing participant:", participantId);
      } else {
        // Create new participant record
        console.log("➕ Creating new participant...");
        const { data: newParticipant, error } = await supabase
          .from("participants")
          .insert({
            game_id: game.id,
            nickname: selectedPlayer.player_name,
            preregistered_player_id: selectedPlayerId,
            team_id: matchingTeam.id,
            joined_at: new Date().toISOString(),
          })
          .select()
          .single();

        console.log("👤 New participant result:", { newParticipant, error });

        if (error) {
          console.error("❌ Failed to create participant:", error);
          throw error;
        }
        participantId = newParticipant.id;
      }

      // Store participant info and navigate to waiting room
      const participantInfo = { id: participantId, nickname: selectedPlayer.player_name };
      sessionStorage.setItem(`participant-${game.id}`, JSON.stringify(participantInfo));
      console.log("💾 Stored participant info:", participantInfo);

      toast({
        title: "참여 완료!",
        description: `${selectedPlayer.player_name}님, 환영합니다!`,
      });

      const redirectUrl = `/game/${game.id}/wait?participant=${participantId}`;
      console.log("🚀 Redirecting to:", redirectUrl);
      router.push(redirectUrl);
    } catch (error) {
      console.error("❌ Unexpected error during join:", error);
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "게임 참여에 실패했습니다. 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if game is joinable
  const canJoin = game.isJoinable !== false && (game.status === "waiting" || !game.status);
  
  console.log("🎮 Game join status:", {
    gameId: game.id,
    gameCode: game.join_code,
    status: game.status,
    isJoinable: game.isJoinable,
    canJoin,
    selectedPlayerId,
    availablePlayersCount: availablePlayers.length
  });

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <Card className="w-full max-w-4xl shadow-lg">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-3xl font-bold">게임 참여</CardTitle>
          <p className="text-2xl font-semibold text-primary mt-2">{game.title}</p>
          
          {/* Game Status */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <Badge variant={game.status === "waiting" ? "default" : "secondary"} className="text-base px-4 py-1">
              {game.status === "waiting" ? "참여 가능" : "참여 불가"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!canJoin ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {game.status !== "waiting" 
                  ? "게임이 이미 시작되었거나 종료되었습니다."
                  : "게임 참여가 불가능합니다."
                }
              </AlertDescription>
            </Alert>
          ) : loadingPlayers ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">명단을 불러오는 중...</p>
            </div>
          ) : availablePlayers.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                등록된 학생이 없습니다. 관리자에게 문의하세요.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              <p className="text-lg font-semibold text-center">
                명단에서 본인 이름을 선택하세요
              </p>
              
              {/* Grid layout for better visibility */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-2">
                {availablePlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`p-6 rounded-xl border-3 transition-all text-center ${
                      selectedPlayerId === player.id
                        ? "border-primary bg-primary/20 shadow-lg scale-105"
                        : "border-gray-300 hover:border-primary/60 hover:shadow-md hover:scale-102"
                    }`}
                  >
                    <div className="space-y-2">
                      {selectedPlayerId === player.id && (
                        <CheckCircle className="h-6 w-6 text-primary mx-auto" />
                      )}
                      <p className="font-bold text-lg">{player.player_name}</p>
                      <div className="flex flex-col gap-1 items-center">
                        {player.player_number && (
                          <Badge variant="outline" className="text-sm">
                            #{player.player_number}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-sm">
                          {player.team_name}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <Button 
                onClick={(e) => {
                  console.log("🖱️ Button clicked!", { 
                    isLoading, 
                    selectedPlayerId, 
                    canJoin,
                    gameStatus: game.status,
                    event: e 
                  });
                  handleJoin();
                }}
                className="w-full h-14 text-lg font-semibold"
                disabled={isLoading || !selectedPlayerId || !canJoin}
              >
                {isLoading ? "참여 중..." : !canJoin ? "게임 참여 불가" : "게임 참여"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
