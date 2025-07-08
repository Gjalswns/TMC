"use client"

import { useState } from "react"
import type { Database } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Trophy, Users, Plus, Minus } from "lucide-react"

type Team = Database["public"]["Tables"]["teams"]["Row"]
type Participant = Database["public"]["Tables"]["participants"]["Row"]

interface ScoreboardProps {
  teams: Team[]
  participants: Participant[]
  currentRound: number
  onScoreUpdate: (teamId: string, score: number) => void
}

export function Scoreboard({ teams, participants, currentRound, onScoreUpdate }: ScoreboardProps) {
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})

  const getTeamParticipants = (teamId: string) => {
    return participants.filter((p) => p.team_id === teamId)
  }

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score)

  const handleScoreChange = (teamId: string, change: number) => {
    const team = teams.find((t) => t.id === teamId)
    if (team) {
      const newScore = Math.max(0, team.score + change)
      onScoreUpdate(teamId, newScore)
    }
  }

  const handleDirectScoreUpdate = (teamId: string) => {
    const inputValue = scoreInputs[teamId]
    if (inputValue !== undefined) {
      const newScore = Math.max(0, Number.parseInt(inputValue) || 0)
      onScoreUpdate(teamId, newScore)
      setScoreInputs((prev) => ({ ...prev, [teamId]: "" }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Round {currentRound} Scoreboard</h2>
        <p className="text-muted-foreground">Live scores and team standings</p>
      </div>

      <div className="grid gap-4">
        {sortedTeams.map((team, index) => {
          const teamParticipants = getTeamParticipants(team.id)
          const isWinning = index === 0 && team.score > 0

          return (
            <Card key={team.id} className={`${isWinning ? "ring-2 ring-yellow-400" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isWinning && <Trophy className="h-5 w-5 text-yellow-500" />}
                    <CardTitle className="text-xl">{team.team_name}</CardTitle>
                    <Badge variant="secondary">#{index + 1}</Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">{team.score}</div>
                    <div className="text-sm text-muted-foreground">points</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Team Members */}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {teamParticipants.map((participant) => (
                      <Badge key={participant.id} variant="outline" className="text-xs">
                        {participant.nickname}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Score Controls */}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleScoreChange(team.id, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>

                  <Button size="sm" variant="outline" onClick={() => handleScoreChange(team.id, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>

                  <div className="flex gap-2 ml-auto">
                    <Input
                      type="number"
                      placeholder="Set score"
                      value={scoreInputs[team.id] || ""}
                      onChange={(e) => setScoreInputs((prev) => ({ ...prev, [team.id]: e.target.value }))}
                      className="w-24"
                      min="0"
                    />
                    <Button size="sm" onClick={() => handleDirectScoreUpdate(team.id)} disabled={!scoreInputs[team.id]}>
                      Set
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
