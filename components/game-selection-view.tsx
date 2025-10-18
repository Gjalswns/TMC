"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calculator,
  Target,
  Users,
  Trophy,
  Brain,
  Zap,
  Clock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type Database } from "@/lib/supabase";
import { useGameUpdates } from "@/hooks/use-realtime";

type Game = Database["public"]["Tables"]["games"]["Row"];
type Team = Database["public"]["Tables"]["teams"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];

interface GameSelectionViewProps {
  game: Game;
  participant: Participant | null;
  teams: Team[];
}

export function GameSelectionView({
  game: initialGame,
  participant,
  teams,
}: GameSelectionViewProps) {
  const [game, setGame] = useState(initialGame);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (participant?.team_id) {
      const team = teams.find((t) => t.id === participant.team_id);
      setMyTeam(team || null);
    }
  }, [participant?.team_id, teams]);

  // Listen for game updates and auto-redirect to Year Game when started
  useGameUpdates(game.id, (updatedGame) => {
    setGame(updatedGame as Game);

    // If current round is 1, auto-redirect to Year Game (even if not started)
    if (updatedGame.current_round === 1 && participant?.id) {
      router.push(`/game/${game.id}/year-game?participant=${participant.id}`);
    }
  });

  const handleGameSelect = (gameType: string) => {
    if (!participant?.id) return;

    switch (gameType) {
      case "year-game":
        router.push(`/game/${game.id}/year-game?participant=${participant.id}`);
        break;
      case "score-steal":
        router.push(
          `/game/${game.id}/score-steal?participant=${participant.id}`
        );
        break;
      case "relay-quiz":
        router.push(
          `/game/${game.id}/relay-quiz?participant=${participant.id}`
        );
        break;
      default:
        break;
    }
  };

  const games = [
    {
      id: "year-game",
      title: "Year Game",
      description:
        "Use 4 numbers to create mathematical expressions for numbers 1-50",
      icon: Calculator,
      color: "bg-blue-500",
      features: ["Mathematical thinking", "Creativity", "Problem solving"],
      duration: "3 minutes",
      difficulty: "Medium",
    },
    {
      id: "score-steal",
      title: "Score Steal Game",
      description:
        "Answer questions correctly to steal points from other teams",
      icon: Zap,
      color: "bg-red-500",
      features: ["Speed", "Competition", "Quick thinking"],
      duration: "2 minutes",
      difficulty: "Easy",
    },
    {
      id: "relay-quiz",
      title: "Relay Quiz Game",
      description: "Team members take turns answering questions in sequence",
      icon: Users,
      color: "bg-green-500",
      features: ["Teamwork", "Cooperation", "Strategy"],
      duration: "5 minutes",
      difficulty: "Hard",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <div className="container mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">{game.title}</h1>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="default" className="text-lg px-4 py-2">
              Round {game.current_round}
            </Badge>
            <Badge variant="outline">{game.grade_class}</Badge>
          </div>
        </div>

        {/* My Team Status */}
        {myTeam && (
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Your Team: {myTeam.team_name}</span>
                <Badge variant="secondary">Score: {myTeam.score}</Badge>
              </CardTitle>
              <CardDescription>
                {participant?.nickname} • Choose a game to play
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Game Selection */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Choose Your Game</h2>
          <p className="text-muted-foreground">
            Select one of the three games below. Each game offers a different
            challenge!
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {games.map((gameOption) => {
            const IconComponent = gameOption.icon;
            return (
              <Card
                key={gameOption.id}
                className="hover:shadow-lg transition-shadow cursor-pointer group"
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`p-3 rounded-full ${gameOption.color} text-white`}
                    >
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">
                        {gameOption.title}
                      </CardTitle>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {gameOption.duration}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {gameOption.difficulty}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {gameOption.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Key Features:</h4>
                    <ul className="space-y-1">
                      {gameOption.features.map((feature, index) => (
                        <li
                          key={index}
                          className="text-sm text-muted-foreground flex items-center gap-2"
                        >
                          <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    onClick={() => handleGameSelect(gameOption.id)}
                    className="w-full group-hover:bg-primary/90"
                    disabled={!participant?.id}
                  >
                    Play {gameOption.title}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Game Rules Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Game Rules Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Year Game
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Use 4 given numbers exactly once each</li>
                  <li>• Create expressions for numbers 1-50</li>
                  <li>• Use +, -, ×, ÷, ^, log, ↑↑ operations</li>
                  <li>• Most numbers found wins</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Score Steal
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Answer questions quickly</li>
                  <li>• Steal points from other teams</li>
                  <li>• Fastest correct answer wins</li>
                  <li>• Strategy and speed matter</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Relay Quiz
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Team members take turns</li>
                  <li>• Pass questions to next member</li>
                  <li>• Teamwork and communication</li>
                  <li>• Complete the relay fastest</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Scoreboard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Current Team Rankings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {teams
                .sort((a, b) => b.score - a.score)
                .map((team, index) => {
                  const isMyTeam = myTeam?.id === team.id;
                  const isWinning = index === 0 && team.score > 0;

                  return (
                    <div
                      key={team.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
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
                        <p className="text-xl font-bold">{team.score}</p>
                        <p className="text-sm text-muted-foreground">points</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
