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
  const [usePolling, setUsePolling] = useState(false)

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

    // 🔥 실시간 구독 추가 (with error handling)
    console.log(`🔔 Setting up realtime subscriptions for game ${id}`)

    // Participants 구독
    const participantsChannel = supabase
      .channel(`admin-participants-${id}`, {
        config: {
          broadcast: { self: true },
          presence: { key: id },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `game_id=eq.${id}`,
        },
        async (payload) => {
          console.log('👤 Participant change:', payload)
          
          // 참가자 목록 새로고침
          const { data: updatedParticipants } = await supabase
            .from("participants")
            .select("*")
            .eq("game_id", id)
            .order("joined_at")
          
          if (updatedParticipants) {
            setParticipants(updatedParticipants)
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to participants updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Failed to subscribe to participants:', err)
          console.log('🔄 Switching to polling mode...')
          setUsePolling(true)
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Participants subscription timeout')
          setUsePolling(true)
        }
      })

    // Teams 구독
    const teamsChannel = supabase
      .channel(`admin-teams-${id}`, {
        config: {
          broadcast: { self: true },
          presence: { key: id },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `game_id=eq.${id}`,
        },
        async (payload) => {
          console.log('👥 Team change:', payload)
          
          // 팀 목록 새로고침
          const { data: updatedTeams } = await supabase
            .from("teams")
            .select("*")
            .eq("game_id", id)
            .order("team_number")
          
          if (updatedTeams) {
            setTeams(updatedTeams)
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to teams updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Failed to subscribe to teams:', err)
        }
      })

    // Game 구독
    const gameChannel = supabase
      .channel(`admin-game-${id}`, {
        config: {
          broadcast: { self: true },
          presence: { key: id },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${id}`,
        },
        async (payload) => {
          console.log('🎮 Game change:', payload)
          
          if (payload.new) {
            setGame(payload.new)
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to game updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Failed to subscribe to game:', err)
        }
      })

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up realtime subscriptions')
      supabase.removeChannel(participantsChannel)
      supabase.removeChannel(teamsChannel)
      supabase.removeChannel(gameChannel)
    }
  }, [id])

  // 폴링 Fallback (Realtime 실패 시)
  useEffect(() => {
    if (!usePolling || !id) return

    console.log('🔄 Starting polling mode (every 2 seconds)...')

    const pollInterval = setInterval(async () => {
      // 참가자 새로고침
      const { data: updatedParticipants } = await supabase
        .from("participants")
        .select("*")
        .eq("game_id", id)
        .order("joined_at")
      
      if (updatedParticipants) {
        setParticipants(updatedParticipants)
      }

      // 팀 새로고침
      const { data: updatedTeams } = await supabase
        .from("teams")
        .select("*")
        .eq("game_id", id)
        .order("team_number")
      
      if (updatedTeams) {
        setTeams(updatedTeams)
      }

      // 게임 새로고침
      const { data: updatedGame } = await supabase
        .from("games")
        .select("*")
        .eq("id", id)
        .single()
      
      if (updatedGame) {
        setGame(updatedGame)
      }
    }, 2000) // 2초마다 폴링

    return () => {
      console.log('🧹 Stopping polling mode')
      clearInterval(pollInterval)
    }
  }, [usePolling, id])

  if (loading) return <div>Loading...</div>
  if (!game) return <div>Game not found.</div>

  return <GameDashboard game={game} teams={teams} participants={participants} />
}
