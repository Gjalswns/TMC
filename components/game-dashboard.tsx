"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { type Database, supabase } from "@/lib/supabase";
import {
  useGameUpdates,
  useParticipantUpdates,
  useTeamUpdates,
} from "@/hooks/use-realtime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import {
  startGame,
  updateScore,
  nextRound,
  updateTimeout,
} from "@/lib/game-actions";
import { TeamAssignment } from "./team-assignment";
import { Scoreboard } from "./scoreboard";
import { YearGameAdmin } from "./year-game-admin";
import { ScoreStealAdmin } from "./score-steal-admin";
import { RelayQuizAdmin } from "./relay-quiz-admin";
import { getScoreStealQuestions } from "@/lib/score-steal-actions";
import { getRelayQuizQuestions } from "@/lib/relay-quiz-actions";
import {
  Users,
  Clock,
  Hash,
  ExternalLink,
  ArrowLeft,
  Copy,
  Check,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { Input } from "./ui/input";

type Game = Database["public"]["Tables"]["games"]["Row"] & {
  round1_timeout_seconds: number;
  total_rounds: number | null;
  game_type?: string;
};
type Team = Database["public"]["Tables"]["teams"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];

interface GameDashboardProps {
  game: Game;
  teams: Team[];
  participants: Participant[];
}

export function GameDashboard({
  game: initialGame,
  teams: initialTeams,
  participants: initialParticipants,
}: GameDashboardProps) {
  const [game, setGame] = useState(initialGame);
  const [teams, setTeams] = useState(initialTeams);
  const [participants, setParticipants] = useState(initialParticipants);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [round1Timeout, setRound1Timeout] = useState(
    game.round1_timeout_seconds || 60
  );
  const [roundQuestions, setRoundQuestions] = useState<{
    [key: number]: { scoreSteal: number; relayQuiz: number };
  }>({});
  const [websocketStatus, setWebsocketStatus] = useState<{
    games: boolean;
    participants: boolean;
    teams: boolean;
  }>({ games: false, participants: false, teams: false });
  const router = useRouter();

  const gameUrl = `/join/${game.game_code}`;

  // Load round questions count
  const loadRoundQuestions = useCallback(async () => {
    const questions: {
      [key: number]: { scoreSteal: number; relayQuiz: number };
    } = {};

    // Load questions for rounds 2-4
    for (let round = 2; round <= 4; round++) {
      const [scoreStealResult, relayQuizResult] = await Promise.all([
        getScoreStealQuestions(game.id, round),
        getRelayQuizQuestions(game.id, round),
      ]);

      questions[round] = {
        scoreSteal: scoreStealResult.success
          ? scoreStealResult.questions?.length || 0
          : 0,
        relayQuiz: relayQuizResult.success
          ? relayQuizResult.questions?.length || 0
          : 0,
      };
    }

    setRoundQuestions(questions);
  }, [game.id]);

  // Load questions on mount and when game changes
  useEffect(() => {
    loadRoundQuestions();
  }, [loadRoundQuestions]);

  const copyGameCode = async () => {
    try {
      await navigator.clipboard.writeText(game.game_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      console.log("Game code:", game.game_code);
    }
  };

  // Use the new realtime hooks
  const handleGameUpdate = useCallback((updatedGame: any) => {
    console.log("🎮 Game updated via websocket:", updatedGame);
    setGame(updatedGame as Game);
    setWebsocketStatus((prev) => ({ ...prev, games: true }));
  }, []);

  const handleNewParticipant = useCallback((newParticipant: any) => {
    console.log("👤 New participant joined via websocket:", newParticipant);
    setParticipants((prev) => [...prev, newParticipant as Participant]);
    setWebsocketStatus((prev) => ({ ...prev, participants: true }));
  }, []);

  const handleParticipantUpdate = useCallback((updatedParticipant: any) => {
    console.log("👤 Participant updated via websocket:", updatedParticipant);
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === updatedParticipant.id ? (updatedParticipant as Participant) : p
      )
    );
    setWebsocketStatus((prev) => ({ ...prev, participants: true }));
  }, []);

  const handleParticipantDelete = useCallback((deletedParticipant: any) => {
    console.log("👤 Participant left via websocket:", deletedParticipant);
    setParticipants((prev) =>
      prev.filter((p) => p.id !== deletedParticipant.id)
    );
    setWebsocketStatus((prev) => ({ ...prev, participants: true }));
  }, []);

  const handleNewTeam = useCallback((newTeam: any) => {
    console.log("🏆 New team created via websocket:", newTeam);
    setTeams((prev) => [...prev, newTeam as Team]);
    setWebsocketStatus((prev) => ({ ...prev, teams: true }));
  }, []);

  const handleTeamUpdate = useCallback((updatedTeam: any) => {
    console.log("🏆 Team updated via websocket:", updatedTeam);
    setTeams((prev) =>
      prev.map((t) => (t.id === updatedTeam.id ? (updatedTeam as Team) : t))
    );
    setWebsocketStatus((prev) => ({ ...prev, teams: true }));
  }, []);

  const handleTeamDelete = useCallback((deletedTeam: any) => {
    console.log("🏆 Team deleted via websocket:", deletedTeam);
    setTeams((prev) => prev.filter((t) => t.id !== deletedTeam.id));
    setWebsocketStatus((prev) => ({ ...prev, teams: true }));
  }, []);

  useGameUpdates(game.id, handleGameUpdate);
  useParticipantUpdates(
    game.id,
    handleNewParticipant,
    handleParticipantUpdate,
    handleParticipantDelete
  );
  useTeamUpdates(game.id, handleNewTeam, handleTeamUpdate, handleTeamDelete);

  const handleStartGame = async () => {
    setIsLoading(true);
    try {
      console.log("🚀 Starting game...");
      const result = await startGame(game.id);
      if (result.success) {
        console.log("✅ Game started successfully");

        setGame((prevGame) => ({
          ...prevGame,
          status: "started",
          current_round: 1,
          started_at: new Date().toISOString(),
        }));

        // Force refresh to get updated data and trigger websocket reconnection
        setTimeout(() => {
          router.refresh();
          // Reset websocket status to show reconnection
          setWebsocketStatus({
            games: false,
            participants: false,
            teams: false,
          });
        }, 1000);

        // Show success message
        console.log("🎮 Game is now active! Websocket should be connected.");
      } else {
        console.error("❌ Failed to start game:", result.error);
        alert(result.error);
      }
    } catch (error) {
      console.error("❌ Error starting game:", error);
      alert("Failed to start game");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextRound = async () => {
    setIsLoading(true);
    const result = await nextRound(game.id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
    setIsLoading(false);
  };

  const handleUpdateTimeout = async () => {
    setIsLoading(true);
    const result = await updateTimeout(game.id, round1Timeout);
    if (!result.success) {
      alert(result.error);
    } else {
      alert("Timeout updated successfully!");
    }
    setIsLoading(false);
  };

  const unassignedParticipants = participants.filter((p) => !p.team_id);
  const assignedParticipants = participants.filter((p) => p.team_id);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Game Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{game.title}</h1>
            <p className="text-muted-foreground">{game.grade_class}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge
            variant={game.status === "waiting" ? "secondary" : "default"}
            className="text-lg px-4 py-2"
          >
            {game.status === "started"
              ? `Round ${game.current_round}`
              : game.status}
          </Badge>

          {/* Websocket Status Indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                websocketStatus.games ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-muted-foreground">Games</span>
            <div
              className={`w-2 h-2 rounded-full ${
                websocketStatus.participants ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-muted-foreground">Participants</span>
            <div
              className={`w-2 h-2 rounded-full ${
                websocketStatus.teams ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-muted-foreground">Teams</span>
          </div>
        </div>
      </div>

      {/* Game Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={copyGameCode}
        >
          <CardContent className="flex items-center gap-2 p-4">
            <Hash className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-2xl font-bold">{game.game_code}</p>
              <p className="text-sm text-muted-foreground">
                Game Code (Click to copy)
              </p>
            </div>
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{participants.length}</p>
              <p className="text-sm text-muted-foreground">Students</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">60</p>
              <p className="text-sm text-muted-foreground">Minutes</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{game.team_count}</p>
              <p className="text-sm text-muted-foreground">Teams</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Round Questions Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Round Questions Overview
          </CardTitle>
          <CardDescription>Questions prepared for each round</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Round 1 - Year Game */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Round 1 - Year Game</h4>
                <Badge variant="outline">Numbers</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Uses 4 target numbers for mathematical expressions
              </p>
            </div>

            {/* Round 2 - Score Steal */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Round 2 - Score Steal</h4>
                <Badge variant="outline">
                  {roundQuestions[2]?.scoreSteal || 0} questions
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Teams attack each other with questions
              </p>
            </div>

            {/* Rounds 3-4 - Relay Quiz */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Rounds 3-4 - Relay Quiz</h4>
                <Badge variant="outline">
                  {roundQuestions[3]?.relayQuiz || 0} +{" "}
                  {roundQuestions[4]?.relayQuiz || 0} questions
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Sequential questions with connected answers
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {game.status === "waiting" && (
        <Card>
          <CardHeader>
            <CardTitle>Round 1 Timeout</CardTitle>
            <CardDescription>
              Set the time limit for the first round in seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Timer className="h-5 w-5 text-muted-foreground" />
            <Input
              type="number"
              value={round1Timeout}
              onChange={(e) => setRound1Timeout(parseInt(e.target.value, 10))}
              className="max-w-xs"
              disabled={game.status !== "waiting"}
            />
            <Button
              onClick={handleUpdateTimeout}
              disabled={isLoading || game.status !== "waiting"}
            >
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </CardContent>
        </Card>
      )}

      {game.status === "waiting" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* QR Code and Join Info */}
          <Card>
            <CardHeader>
              <CardTitle>Student Access</CardTitle>
              <CardDescription>
                Students can join using the QR code or game code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <QRCodeSVG value={gameUrl} size={200} />
              </div>
              <div className="text-center space-y-2">
                <p className="font-mono text-lg">{game.game_code}</p>
                <p className="text-sm text-muted-foreground">
                  Students visit your site and enter this code, or scan the QR
                  code above
                </p>
                <Button
                  variant="outline"
                  asChild
                  className="w-full bg-transparent"
                >
                  <a href={gameUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Test Join Page
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Team Assignment */}
          <TeamAssignment
            teams={teams}
            participants={participants}
            gameId={game.id}
            onAssignmentChange={(newParticipants) =>
              setParticipants(newParticipants)
            }
          />
        </div>
      )}

      {game.status === "waiting" && participants.length > 0 && (
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={handleStartGame}
            disabled={isLoading || unassignedParticipants.length > 0}
            size="lg"
          >
            {isLoading ? "Starting..." : "Start Game"}
          </Button>
          {unassignedParticipants.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Assign all students to teams before starting
            </p>
          )}
        </div>
      )}

      {game.status === "started" && (
        <div className="space-y-6">
          {/* Round 1: Year Game */}
          {game.current_round === 1 && (
            <YearGameAdmin
              gameId={game.id}
              currentRound={game.current_round}
              onGameUpdate={() => {
                // Refresh the page to get updated data
                router.refresh();
                loadRoundQuestions();
              }}
            />
          )}

          {/* Round 2: Score Steal Game */}
          {game.current_round === 2 && (
            <ScoreStealAdmin
              gameId={game.id}
              currentRound={game.current_round}
              onGameUpdate={() => {
                // Refresh the page to get updated data
                router.refresh();
                loadRoundQuestions();
              }}
            />
          )}

          {/* Rounds 3-4: Relay Quiz Game */}
          {(game.current_round === 3 || game.current_round === 4) && (
            <RelayQuizAdmin
              gameId={game.id}
              currentRound={game.current_round}
              onGameUpdate={() => {
                // Refresh the page to get updated data
                router.refresh();
                loadRoundQuestions();
              }}
            />
          )}

          {/* Next Round Button */}
          {game.current_round < (game.total_rounds || 4) && (
            <div className="flex justify-center">
              <Button onClick={handleNextRound} disabled={isLoading} size="lg">
                {isLoading
                  ? "Loading..."
                  : `Next Round (${game.current_round + 1})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
