'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTeamUpdates } from '@/hooks/use-realtime'
import React from 'react'

interface Team {
  id: string
  team_name: string
  team_number: number
  score: number
  bracket: 'higher' | 'lower' | null
}

export const BracketScoreboard = React.memo(function BracketScoreboard({ gameId }: { gameId: string }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(false)

  const loadTeams = useCallback(async () => {
    if (!gameId) return
    
    setLoading(true)
    try {
      console.log('🔄 Loading teams for bracket scoreboard...')
      const { data } = await supabase
        .from('teams')
        .select('*')
        .eq('game_id', gameId)
        .order('score', { ascending: false })

      if (data) {
        console.log('✅ Teams loaded:', data.length)
        setTeams(data)
      }
    } catch (error) {
      console.error('❌ Load teams error:', error)
    } finally {
      setLoading(false)
    }
  }, [gameId])

  // 실시간 업데이트 핸들러
  const handleTeamInsert = useCallback((team: Team) => {
    console.log('📡 Team inserted:', team.team_name)
    loadTeams()
  }, [loadTeams])

  const handleTeamUpdate = useCallback((team: Team) => {
    console.log('📡 Team updated:', team.team_name, 'Score:', team.score)
    setTeams(prevTeams => {
      const updatedTeams = prevTeams.map(t => 
        t.id === team.id ? { ...t, ...team } : t
      )
      // Re-sort by score
      return updatedTeams.sort((a, b) => b.score - a.score)
    })
  }, [])

  const handleTeamDelete = useCallback((team: Team) => {
    console.log('📡 Team deleted:', team.team_name)
    setTeams(prevTeams => prevTeams.filter(t => t.id !== team.id))
  }, [])

  // 관리자 페이지와 동일한 실시간 업데이트 훅 사용
  useTeamUpdates(gameId, handleTeamInsert, handleTeamUpdate, handleTeamDelete)

  useEffect(() => {
    loadTeams()
  }, [loadTeams])

  // 폴링 백업 (5초마다)
  useEffect(() => {
    if (!gameId) return

    const interval = setInterval(() => {
      console.log('🔄 Polling teams update...')
      loadTeams()
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [gameId, loadTeams])

  const higherBracketTeams = teams
    .filter(t => t.bracket === 'higher')
    .sort((a, b) => b.score - a.score)

  const lowerBracketTeams = teams
    .filter(t => t.bracket === 'lower')
    .sort((a, b) => b.score - a.score)

  const renderTeamList = (bracketTeams: Team[], color: string) => {
    if (bracketTeams.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          팀이 없습니다
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {bracketTeams.map((team, index) => (
          <div
            key={team.id}
            className={`
              flex items-center justify-between p-3 rounded-lg
              transition-all duration-300
              ${index === 0 ? `bg-${color}-100 border-2 border-${color}-500` : 'bg-white border'}
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                ${index === 0 ? `bg-${color}-500 text-white` : 'bg-gray-200 text-gray-600'}
              `}>
                {index + 1}
              </div>
              <div>
                <div className="font-semibold text-base">{team.team_name}</div>
                <div className="text-xs text-muted-foreground">
                  팀 #{team.team_number}
                </div>
              </div>
            </div>
            <div className="text-right flex items-center gap-2">
              <div>
                <div className={`
                  text-2xl font-bold
                  ${index === 0 ? `text-${color}-600` : 'text-gray-900'}
                `}>
                  {team.score.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">점</div>
              </div>
              {index === 0 && (
                <Trophy className={`h-6 w-6 text-${color}-500`} />
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6">실시간 점수판</h1>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Higher Bracket */}
          <Card className="border-blue-200">
            <CardHeader className="bg-blue-50 py-3">
              <CardTitle className="flex items-center justify-between">
                <span className="text-blue-600 text-xl">Higher Bracket</span>
                <Badge variant="default" className="text-sm px-3 py-1">
                  {higherBracketTeams.length}팀
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {renderTeamList(higherBracketTeams, 'blue')}
            </CardContent>
          </Card>

          {/* Lower Bracket */}
          <Card className="border-orange-200">
            <CardHeader className="bg-orange-50 py-3">
              <CardTitle className="flex items-center justify-between">
                <span className="text-orange-600 text-xl">Lower Bracket</span>
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {lowerBracketTeams.length}팀
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {renderTeamList(lowerBracketTeams, 'orange')}
            </CardContent>
          </Card>
        </div>

        {loading && (
          <div className="flex items-center justify-center mt-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2 text-muted-foreground">점수판 로딩 중...</span>
          </div>
        )}
      </div>
    </div>
  )
})
