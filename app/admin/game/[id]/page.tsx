'use client'

import { useParams } from 'next/navigation'
import { supabase } from "@/lib/supabase"
import { GameDashboard } from "@/components/game-dashboard"
import { notFound } from "next/navigation"
import { useEffect, useState } from "react"

export default function GamePage() {
  const params = useParams()
  const id = params?.id as string

  const [game, setGame] = useState<any>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    const fetchGameData = async () => {
      const { data: gameData } = await supabase
        .from("games")
        .select("*, teams(*), participants(*)")
        .eq("id", id)
        .single()

      if (!gameData) {
        notFound()
        return
      }

      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .eq("game_id", id)
        .order("team_number")

      const { data: participantsData } = await supabase
        .from("participants")
        .select("*")
        .eq("game_id", id)
        .order("joined_at")

      setGame(gameData)
      setTeams(teamsData || [])
      setParticipants(participantsData || [])
      setLoading(false)
    }

    fetchGameData()
  }, [id])

  if (loading) return <div>Loading...</div>
  if (!game) return <div>Game not found.</div>

  return <GameDashboard game={game} teams={teams} participants={participants} />
}
