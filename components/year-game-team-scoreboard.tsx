'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Team = Database['public']['Tables']['teams']['Row']
type YearGameProgress = Database['public']['Views']['year_game_team_progress']['Row']

export function YearGameTeamScoreboard({ sessionId }: { sessionId: string }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [progress, setProgress] = useState<YearGameProgress | null>(null)
  const [loading, setLoading] = useState(false)



  // 팀 목록 로드
  useEffect(() => {
    loadTeams()
  }, [sessionId])

  // 선택된 팀의 진행 상황 로드
  useEffect(() => {
    if (selectedTeamId) {
      loadProgress()
    }
  }, [selectedTeamId, sessionId])

  const loadTeams = useCallback(async () => {
    if (!sessionId) return

    try {
      const { data: session } = await supabase
        .from('year_game_sessions')
        .select('game_id')
        .eq('id', sessionId)
        .single()

      if (!session) return

      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .eq('game_id', session.game_id)
        .order('team_number')

      if (teamsData) {
        setTeams(teamsData)
        if (teamsData.length > 0 && !selectedTeamId) {
          setSelectedTeamId(teamsData[0].id)
        }
      }
    } catch (error) {
      console.error('Load teams error:', error)
    }
  }, [sessionId, selectedTeamId])

  const loadProgress = useCallback(async () => {
    if (!selectedTeamId || !sessionId) return

    setLoading(true)
    try {
      const { data } = await supabase
        .from('year_game_team_progress')
        .select('*')
        .eq('session_id', sessionId)
        .eq('team_id', selectedTeamId)
        .single()

      if (data) {
        setProgress(data)
      }
    } catch (error) {
      console.error('Load progress error:', error)
    } finally {
      setLoading(false)
    }
  }, [sessionId, selectedTeamId])

  // 실시간 업데이트
  useEffect(() => {
    if (!selectedTeamId || !sessionId) return

    const channel = supabase
      .channel(`year_game_team_scoreboard_${sessionId}_${selectedTeamId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'year_game_results',
        filter: `session_id=eq.${sessionId}`,
      }, () => {
        loadProgress()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, selectedTeamId, loadProgress])

  const selectedTeam = teams.find(t => t.id === selectedTeamId)

  // 1~100 숫자 그리드 생성
  const renderNumberGrid = () => {
    const numbers = Array.from({ length: 100 }, (_, i) => i + 1)
    const foundNumbers = new Set(progress?.numbers_found || [])

    return (
      <div className="grid grid-cols-10 gap-2">
        {numbers.map(num => (
          <div
            key={num}
            className={`
              aspect-square flex items-center justify-center rounded-lg text-lg font-bold
              transition-all duration-300
              ${foundNumbers.has(num)
                ? 'bg-green-500 text-white scale-110 shadow-lg'
                : 'bg-gray-100 text-gray-400'
              }
            `}
          >
            {num}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* 팀 선택 */}
        <Card>
          <CardHeader>
            <CardTitle>팀 선택</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="text-xl">
                <SelectValue placeholder="팀을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id} className="text-xl">
                    {team.team_name}
                    {team.bracket && (
                      <Badge className="ml-2" variant={team.bracket === 'higher' ? 'default' : 'secondary'}>
                        {team.bracket}
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* 점수 정보 */}
        {selectedTeam && progress && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">맞춘 숫자</div>
                  <div className="text-4xl font-bold text-blue-600">
                    {progress.total_found}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">/ 100</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">총점</div>
                  <div className="text-4xl font-bold text-green-600">
                    {progress.score.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">점</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">진행률</div>
                  <div className="text-4xl font-bold text-purple-600">
                    {(progress.progress_percentage ?? 0).toFixed(0)}%
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 숫자 그리드 */}
        {progress && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">
                {selectedTeam?.team_name} - 맞춘 숫자 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderNumberGrid()}
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="text-center py-8 text-muted-foreground">
            로딩 중...
          </div>
        )}
      </div>
    </div>
  )
}
