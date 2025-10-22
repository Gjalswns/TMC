"use client"

import { useState, useEffect } from "react"
import type { Database } from "@/lib/supabase"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users } from "lucide-react"

type Team = Database["public"]["Tables"]["teams"]["Row"]
type Participant = Database["public"]["Tables"]["participants"]["Row"] & {
  preregistered_player_id?: string | null
}

type PreregisteredPlayer = {
  id: string
  player_name: string
  player_number: number | null
  team_name: string
  bracket: 'higher' | 'lower'
  is_active: boolean
}

interface TeamAssignmentProps {
  teams: Team[]
  participants: Participant[]
  gameId: string
  onAssignmentChange: (participants: Participant[]) => void
}

export function TeamAssignment({ teams, participants }: TeamAssignmentProps) {
  const [allPlayers, setAllPlayers] = useState<PreregisteredPlayer[]>([])
  const [loading, setLoading] = useState(true)

  // Load all preregistered players
  useEffect(() => {
    const loadAllPlayers = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from("preregistered_players")
          .select("*")
          .eq("is_active", true)
          .order("team_name")
          .order("player_number")

        if (!error && data) {
          setAllPlayers(data)
        }
      } catch (error) {
        console.error("Failed to load players:", error)
      } finally {
        setLoading(false)
      }
    }

    loadAllPlayers()
  }, [])

  // Group players by team
  const playersByTeam = teams.map(team => ({
    team,
    players: allPlayers.filter(p => p.team_name === team.team_name)
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          팀 명단
        </CardTitle>
        <CardDescription>
          팀별 학생 명단을 확인하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>명단을 불러오는 중...</p>
          </div>
        ) : allPlayers.length > 0 ? (
          <div className="space-y-4">
            {playersByTeam.map(({ team, players: teamPlayers }) => {
              return (
                <Card key={team.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h5 className="font-medium">{team.team_name}</h5>
                        {(team as any).bracket && (
                          <Badge variant="outline" className="text-xs">
                            {(team as any).bracket}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary">
                        {teamPlayers.length}명
                      </Badge>
                    </div>
                    
                    {teamPlayers.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">팀원이 없습니다</p>
                    ) : (
                      <div className="space-y-2">
                        {teamPlayers.map((player) => {
                          return (
                            <div 
                              key={player.id} 
                              className="flex items-center gap-2 p-2 border rounded"
                            >
                              <span className="flex-1">
                                {player.player_number && `#${player.player_number} `}
                                {player.player_name}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>등록된 학생이 없습니다.</p>
            <p className="text-sm mt-2">참가자 관리 페이지에서 학생을 추가해주세요.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
