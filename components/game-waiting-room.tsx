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

  // Use the new realtime hooks (moved outside useEffect)
  const handleGameUpdate = useCallback(
    (updatedGame: any) => {
      const newGame = updatedGame as Game;
      console.log("Game updated in waiting room:", newGame);
      setGame(newGame);

      // Always redirect to Year Game for Round 1 (even if not started yet)
      if (newGame.current_round === 1) {
        console.log("Redirecting to Year Game...");
        router.push(
          `/game/${newGame.id}/year-game?participant=${participant?.id}`
        );
      } else if (newGame.status === "started") {
        // For other rounds, go to game selection
        console.log("Redirecting to game selection...");
        router.push(
          `/game/${newGame.id}/select?participant=${participant?.id}`
        );
      }
    },
    [router, participant?.id]
  );

  useGameUpdates(game.id, handleGameUpdate);

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
                Waiting for teacher to start the game...
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
