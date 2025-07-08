"use client"

import { useState } from "react"
import type { Database } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { assignTeams } from "@/lib/game-actions"
import { Users, Shuffle } from "lucide-react"

type Team = Database["public"]["Tables"]["teams"]["Row"]
type Participant = Database["public"]["Tables"]["participants"]["Row"]

interface TeamAssignmentProps {
  teams: Team[]
  participants: Participant[]
  gameId: string
  onAssignmentChange: (participants: Participant[]) => void
}

export function TeamAssignment({ teams, participants, gameId, onAssignmentChange }: TeamAssignmentProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [assignments, setAssignments] = useState<Record<string, string>>({})

  const unassignedParticipants = participants.filter((p) => !p.team_id)
  const assignedParticipants = participants.filter((p) => p.team_id)

  const handleAutoAssign = async () => {
    setIsLoading(true)
    try {
      const shuffled = [...unassignedParticipants].sort(() => Math.random() - 0.5)
      const newAssignments: { participantId: string; teamId: string }[] = []

      shuffled.forEach((participant, index) => {
        const teamIndex = index % teams.length
        newAssignments.push({
          participantId: participant.id,
          teamId: teams[teamIndex].id,
        })
      })

      const result = await assignTeams(gameId, newAssignments)
      if (result.success) {
        // Update local state
        const updatedParticipants = participants.map((p) => {
          const assignment = newAssignments.find((a) => a.participantId === p.id)
          return assignment ? { ...p, team_id: assignment.teamId } : p
        })
        onAssignmentChange(updatedParticipants)
      } else {
        alert(result.error)
      }
    } catch (error) {
      alert("Failed to assign teams")
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualAssign = async () => {
    setIsLoading(true)
    try {
      const newAssignments = Object.entries(assignments).map(([participantId, teamId]) => ({
        participantId,
        teamId,
      }))

      const result = await assignTeams(gameId, newAssignments)
      if (result.success) {
        // Update local state
        const updatedParticipants = participants.map((p) => {
          const assignment = newAssignments.find((a) => a.participantId === p.id)
          return assignment ? { ...p, team_id: assignment.teamId } : p
        })
        onAssignmentChange(updatedParticipants)
        setAssignments({})
      } else {
        alert(result.error)
      }
    } catch (error) {
      alert("Failed to assign teams")
    } finally {
      setIsLoading(false)
    }
  }

  const getTeamParticipants = (teamId: string) => {
    return assignedParticipants.filter((p) => p.team_id === teamId)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team Assignment
        </CardTitle>
        <CardDescription>Assign students to teams automatically or manually</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto Assignment */}
        {unassignedParticipants.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Unassigned Students ({unassignedParticipants.length})</h4>
              <Button onClick={handleAutoAssign} disabled={isLoading} variant="outline" size="sm">
                <Shuffle className="mr-2 h-4 w-4" />
                Auto Assign
              </Button>
            </div>

            <div className="space-y-2">
              {unassignedParticipants.map((participant) => (
                <div key={participant.id} className="flex items-center gap-2">
                  <Badge variant="outline" className="flex-1">
                    {participant.nickname}
                  </Badge>
                  <Select
                    value={assignments[participant.id] || ""}
                    onValueChange={(teamId) => setAssignments((prev) => ({ ...prev, [participant.id]: teamId }))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.team_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {Object.keys(assignments).length > 0 && (
              <Button onClick={handleManualAssign} disabled={isLoading} className="w-full">
                {isLoading ? "Assigning..." : "Assign Selected"}
              </Button>
            )}
          </div>
        )}

        {/* Team Overview */}
        <div className="space-y-4">
          <h4 className="font-medium">Team Overview</h4>
          <div className="grid gap-4">
            {teams.map((team) => {
              const teamParticipants = getTeamParticipants(team.id)
              return (
                <Card key={team.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-medium">{team.team_name}</h5>
                      <Badge variant="secondary">{teamParticipants.length} members</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {teamParticipants.map((participant) => (
                        <Badge key={participant.id} variant="outline" className="text-xs">
                          {participant.nickname}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
