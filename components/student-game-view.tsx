"use client"

import { useState, useEffect } from "react"
import { type Database, supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Users, Clock } from "lucide-react"

type Game = Database["public"]["Tables"]["games"]["Row"]
type Team = Database["public"]["Tables"]["teams"]["Row"]
type Participant = Database["public"]["Tables"]["participants"]["Row"]

interface StudentGameViewProps {
  game: Game
  participant: Participant | null
  teams: Team[]
}

export function StudentGameView({ game: initialGame, participant, teams: initialTeams }: StudentGameViewProps) {
  const [game, setGame] = useState(initialGame)
  const [teams, setTeams] = useState(initialTeams)
  const [myTeam, setMyTeam] = useState<Team | null>(null)

  useEffect(() => {
    // Find participant's team
    if (participant?.team_id) {
      const team = teams.find((t) => t.id === participant.team_id)
      setMyTeam(team || null)
    }

    // Subscribe to real-time updates
    const channel = supabase
      .channel("student-game")
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
        { event: "*", schema: "public", table: "teams", filter: `game_id=eq.${game.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTeams((prev) => prev.map((t) => (t.id === payload.new.id ? (payload.new as Team) : t)))

            // Update my team if it's the one that changed
            if (participant?.team_id === payload.new.id) {
              setMyTeam(payload.new as Team)
            }
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [game.id, participant?.team_id, teams])

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score)
  const myTeamRank = myTeam ? sortedTeams.findIndex((t) => t.id === myTeam.id) + 1 : 0

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
                const isMyTeam = myTeam?.id === team.id
                const isWinning = index === 0 && team.score > 0

                return (
                  <div
                    key={team.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isMyTeam ? "bg-primary/5 border-primary" : "bg-muted/50"
                    } ${isWinning ? "ring-2 ring-yellow-400" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {isWinning && <Trophy className="h-5 w-5 text-yellow-500" />}
                        <span className="font-medium text-lg">#{index + 1}</span>
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
                )
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
              Work together with your team and have fun! The scores update automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
