"use client";

import { useState, useEffect } from "react";
import { type Database, supabase } from "@/lib/supabase";
import { useGameUpdates, useTeamUpdates } from "@/hooks/use-realtime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, Clock, Timer } from "lucide-react";
import { YearGamePlayView } from "./year-game-play-view";

type Game = Database["public"]["Tables"]["games"]["Row"] & {
  round1_timeout_seconds?: number;
};
type Team = Database["public"]["Tables"]["teams"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];

interface StudentGameViewProps {
  game: Game;
  participant: Participant | null;
  teams: Team[];
}

export function StudentGameView({
  game: initialGame,
  participant,
  teams: initialTeams,
}: StudentGameViewProps) {
  const [game, setGame] = useState(initialGame);
  const [teams, setTeams] = useState(initialTeams);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  useEffect(() => {
    if (participant?.team_id) {
      const team = teams.find((t) => t.id === participant.team_id);
      setMyTeam(team || null);
    }
  }, [participant?.team_id, teams]);

  useEffect(() => {
    if (game.current_round === 1 && game.round1_timeout_seconds) {
      setRemainingTime(game.round1_timeout_seconds);
      const timer = setInterval(() => {
        setRemainingTime((prevTime) => {
          if (prevTime === null || prevTime <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [game.current_round, game.round1_timeout_seconds]);

  // Use the new realtime hooks
  useGameUpdates(game.id, (updatedGame) => {
    const newGame = updatedGame as Game;
    setGame(newGame);

    // Reset timer when round changes
    if (newGame.current_round !== game.current_round) {
      if (newGame.current_round === 1 && newGame.round1_timeout_seconds) {
        setRemainingTime(newGame.round1_timeout_seconds);
      } else {
        setRemainingTime(null);
      }
    }
  });

  useTeamUpdates(
    game.id,
    (newTeam) => {
      setTeams((prev) => [...prev, newTeam as Team]);
    },
    (updatedTeam) => {
      setTeams((prev) =>
        prev.map((t) => (t.id === updatedTeam.id ? (updatedTeam as Team) : t))
      );
    },
    (deletedTeam) => {
      setTeams((prev) => prev.filter((t) => t.id !== deletedTeam.id));
    }
  );

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);
  const myTeamRank = myTeam
    ? sortedTeams.findIndex((t) => t.id === myTeam.id) + 1
    : 0;

  // Render different components based on current round
  if (game.status === "in_progress") {
    // Round 1: Year Game (only game mode now)
    if (game.current_round === 1) {
      return (
        <YearGamePlayView
          game={game}
          participant={participant!}
          teams={teams}
        />
      );
    }
  }

  // Default view for waiting status or unknown rounds
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <div className="container mx-auto max-w-4xl space-y-6">
        {/* Game Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">{game.title}</h1>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="default" className="text-lg px-4 py-2">
              Round {game.current_round}
            </Badge>
            <Badge variant="outline">{game.grade_class}</Badge>
          </div>
        </div>

        {/* Timer for Round 1 */}
        {game.current_round === 1 && remainingTime !== null && (
          <Card className="text-center">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <Timer className="h-6 w-6" />
                <span>Round 1 Timer</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {remainingTime > 0 ? (
                <p className="text-4xl font-bold">
                  {Math.floor(remainingTime / 60)}:
                  {(remainingTime % 60).toString().padStart(2, "0")}
                </p>
              ) : (
                <p className="text-2xl font-bold text-red-500">Time's up!</p>
              )}
              <p className="text-sm text-muted-foreground">
                The admin can still enter scores.
              </p>
            </CardContent>
          </Card>
        )}

        {/* My Team Status */}
        {myTeam && (
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Your Team: {myTeam.team_name}</span>
                <Badge variant="secondary">Rank #{myTeamRank}</Badge>
              </CardTitle>
              <CardDescription>
                {participant?.nickname} • Current Score: {myTeam.score} points
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Live Scoreboard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Live Scoreboard
            </CardTitle>
            <CardDescription>Real-time team standings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedTeams.map((team, index) => {
                const isMyTeam = myTeam?.id === team.id;
                const isWinning = index === 0 && team.score > 0;

                return (
                  <div
                    key={team.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isMyTeam ? "bg-primary/5 border-primary" : "bg-muted/50"
                    } ${isWinning ? "ring-2 ring-yellow-400" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {isWinning && (
                          <Trophy className="h-5 w-5 text-yellow-500" />
                        )}
                        <span className="font-medium text-lg">
                          #{index + 1}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{team.team_name}</p>
                        {isMyTeam && (
                          <Badge variant="outline" className="text-xs">
                            Your Team
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{team.score}</p>
                      <p className="text-sm text-muted-foreground">points</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Game Info */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="flex items-center gap-2 p-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{game.duration} min</p>
                <p className="text-sm text-muted-foreground">Duration</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-2 p-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{teams.length}</p>
                <p className="text-sm text-muted-foreground">Teams</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Motivational Message */}
        <Card className="text-center">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium mb-2">Good luck!</h3>
            <p className="text-muted-foreground">
              Work together with your team and have fun! The scores update
              automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
