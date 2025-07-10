"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { type Database, supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { QRCodeSVG } from "qrcode.react"
import { startGame, updateScore, nextRound, updateTimeout } from "@/lib/game-actions"
import { TeamAssignment } from "./team-assignment"
import { Scoreboard } from "./scoreboard"
import { Users, Clock, Hash, ExternalLink, ArrowLeft, Copy, Check, Timer } from "lucide-react"
import Link from "next/link"
import { Input } from "./ui/input"

type Game = Database["public"]["Tables"]["games"]["Row"] & {
  round1_timeout_seconds: number
  total_rounds: number | null
}
type Team = Database["public"]["Tables"]["teams"]["Row"]
type Participant = Database["public"]["Tables"]["participants"]["Row"]

interface GameDashboardProps {
  game: Game
  teams: Team[]
  participants: Participant[]
}

export function GameDashboard({
  game: initialGame,
  teams: initialTeams,
  participants: initialParticipants,
}: GameDashboardProps) {
  const [game, setGame] = useState(initialGame)
  const [teams, setTeams] = useState(initialTeams)
  const [participants, setParticipants] = useState(initialParticipants)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [round1Timeout, setRound1Timeout] = useState(game.round1_timeout_seconds || 60)
  const router = useRouter()

  const gameUrl = `/join/${game.game_code}`

  const copyGameCode = async () => {
    try {
      await navigator.clipboard.writeText(game.game_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      console.log("Game code:", game.game_code)
    }
  }

  useEffect(() => {
    // Subscribe to real-time updates
    const gameChannel = supabase
      .channel("game-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setGame(payload.new as Game)
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `game_id=eq.${game.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setParticipants((prev) => [...prev, payload.new as Participant])
          } else if (payload.eventType === "UPDATE") {
            setParticipants((prev) => prev.map((p) => (p.id === payload.new.id ? (payload.new as Participant) : p)))
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams", filter: `game_id=eq.${game.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTeams((prev) => prev.map((t) => (t.id === payload.new.id ? (payload.new as Team) : t)))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(gameChannel)
    }
  }, [game.id])

  const handleStartGame = async () => {
    setIsLoading(true)
    const result = await startGame(game.id)
    if (result.success) {
      setGame((prevGame) => ({ ...prevGame, status: "started", current_round: 1 }))
    } else {
      alert(result.error)
    }
    setIsLoading(false)
  }

  const handleNextRound = async () => {
    setIsLoading(true)
    const result = await nextRound(game.id)
    if (result.success) {
      router.refresh()
    } else {
      alert(result.error)
    }
    setIsLoading(false)
  }

  const handleUpdateTimeout = async () => {
    setIsLoading(true)
    const result = await updateTimeout(game.id, round1Timeout)
    if (!result.success) {
      alert(result.error)
    } else {
      alert("Timeout updated successfully!")
    }
    setIsLoading(false)
  }

  const unassignedParticipants = participants.filter((p) => !p.team_id)
  const assignedParticipants = participants.filter((p) => p.team_id)

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
        <Badge variant={game.status === "waiting" ? "secondary" : "default"} className="text-lg px-4 py-2">
          {game.status === "started" ? `Round ${game.current_round}` : game.status}
        </Badge>
      </div>

      {/* Game Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={copyGameCode}>
          <CardContent className="flex items-center gap-2 p-4">
            <Hash className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-2xl font-bold">{game.game_code}</p>
              <p className="text-sm text-muted-foreground">Game Code (Click to copy)</p>
            </div>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
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
              <p className="text-2xl font-bold">{game.duration}</p>
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

      {game.status === 'waiting' && (
        <Card>
          <CardHeader>
            <CardTitle>Round 1 Timeout</CardTitle>
            <CardDescription>Set the time limit for the first round in seconds.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Timer className="h-5 w-5 text-muted-foreground" />
            <Input 
              type="number" 
              value={round1Timeout} 
              onChange={(e) => setRound1Timeout(parseInt(e.target.value, 10))}
              className="max-w-xs"
              disabled={game.status !== 'waiting'}
            />
            <Button onClick={handleUpdateTimeout} disabled={isLoading || game.status !== 'waiting'}>
              {isLoading ? 'Saving...' : 'Save'}
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
              <CardDescription>Students can join using the QR code or game code</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <QRCodeSVG value={gameUrl} size={200} />
              </div>
              <div className="text-center space-y-2">
                <p className="font-mono text-lg">{game.game_code}</p>
                <p className="text-sm text-muted-foreground">
                  Students visit your site and enter this code, or scan the QR code above
                </p>
                <Button variant="outline" asChild className="w-full bg-transparent">
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
            onAssignmentChange={(newParticipants) => setParticipants(newParticipants)}
          />
        </div>
      )}

      {game.status === "waiting" && participants.length > 0 && (
        <div className="flex flex-col items-center gap-4">
          <Button onClick={handleStartGame} disabled={isLoading || unassignedParticipants.length > 0} size="lg">
            {isLoading ? "Starting..." : "Start Game"}
          </Button>
          {unassignedParticipants.length > 0 && (
            <p className="text-sm text-muted-foreground">Assign all students to teams before starting</p>
          )}
        </div>
      )}

      {game.status === "started" && (
        <div className="space-y-6">
          <Scoreboard
            teams={teams}
            participants={assignedParticipants}
            currentRound={game.current_round}
            onScoreUpdate={(teamId, score) => updateScore(teamId, score)}
          />

          {game.current_round < (game.total_rounds || 3) && (
            <div className="flex justify-center">
              <Button onClick={handleNextRound} disabled={isLoading} size="lg">
                {isLoading ? "Loading..." : `Next Round (${game.current_round + 1})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
