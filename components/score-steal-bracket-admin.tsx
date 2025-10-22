'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { AlertCircle, Lock, Unlock, Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'


interface Team {
  id: string
  team_name: string
  score: number
  bracket: 'higher' | 'lower' | null
}

interface ScoreStealState {
  session_id: string
  current_question_index: number
  higher_bracket_locked: boolean
  lower_bracket_locked: boolean
  higher_winner_team_id: string | null
  higher_winner_team_name: string | null
  lower_winner_team_id: string | null
  lower_winner_team_name: string | null
  phase: 'active' | 'waiting_for_bracket' | 'ready_to_steal'
}

interface Question {
  id: string
  question_text: string
  points: number
}

export function ScoreStealBracketAdmin({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<ScoreStealState | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [higherTargetTeamId, setHigherTargetTeamId] = useState('')
  const [lowerTargetTeamId, setLowerTargetTeamId] = useState('')
  const [loading, setLoading] = useState(false)



  useEffect(() => {
    loadState()
    loadTeams()
    loadCurrentQuestion()
  }, [sessionId])

  const loadState = async () => {
    try {
      const { data } = await supabase
        .from('score_steal_current_state')
        .select('*')
        .eq('session_id', sessionId)
        .single()

      if (data) {
        setState(data)
      }
    } catch (error) {
      console.error('Load state error:', error)
    }
  }

  const loadTeams = async () => {
    try {
      const { data: session } = await supabase
        .from('score_steal_sessions')
        .select('game_id')
        .eq('id', sessionId)
        .single()

      if (!session) return

      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .eq('game_id', session.game_id)
        .order('score', { ascending: false })

      if (teamsData) {
        setTeams(teamsData)
      }
    } catch (error) {
      console.error('Load teams error:', error)
    }
  }

  const loadCurrentQuestion = async () => {
    try {
      const { data: session } = await supabase
        .from('score_steal_sessions')
        .select('current_question_index, question_ids')
        .eq('id', sessionId)
        .single()

      if (!session) return

      const currentQuestionId = session.question_ids[session.current_question_index]
      
      const { data: questionData } = await supabase
        .from('score_steal_questions')
        .select('*')
        .eq('id', currentQuestionId)
        .single()

      if (questionData) {
        setQuestion(questionData)
      }
    } catch (error) {
      console.error('Load question error:', error)
    }
  }

  const handleExecuteSteal = async () => {
    if (!higherTargetTeamId || !lowerTargetTeamId || !question) {
      alert('양쪽 브래킷의 대상 팀을 모두 선택하세요')
      return
    }

    if (!confirm('선택한 팀들의 점수를 탈취하시겠습니까?')) return

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('execute_score_steal', {
        p_session_id: sessionId,
        p_question_id: question.id,
        p_higher_target_team_id: higherTargetTeamId,
        p_lower_target_team_id: lowerTargetTeamId
      })

      if (error) throw error

      const result = data[0]
      if (result.success) {
        alert('점수 탈취 완료!')
        setHigherTargetTeamId('')
        setLowerTargetTeamId('')
        await loadState()
        await loadTeams()
      } else {
        alert(result.message)
      }
    } catch (error) {
      console.error('Execute steal error:', error)
      alert('점수 탈취 실패')
    } finally {
      setLoading(false)
    }
  }

  // 실시간 업데이트
  useEffect(() => {
    const channel1 = supabase
      .channel(`score_steal_admin_${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'score_steal_sessions',
        filter: `id=eq.${sessionId}`,
      }, () => {
        loadState()
      })
      .subscribe()

    const channel2 = supabase
      .channel(`score_steal_teams_${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'teams',
      }, () => {
        loadTeams()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel1)
      supabase.removeChannel(channel2)
    }
  }, [sessionId])

  const higherTeams = teams.filter(t => t.bracket === 'higher')
  const lowerTeams = teams.filter(t => t.bracket === 'lower')

  // 보호된 팀 확인 (이전에 점수를 빼앗긴 팀)
  const [protectedTeams, setProtectedTeams] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadProtectedTeams()
  }, [sessionId])

  const loadProtectedTeams = async () => {
    try {
      const { data } = await supabase
        .from('score_steal_protection')
        .select('team_id')
        .eq('session_id', sessionId)
        .eq('was_stolen_from', true)

      if (data) {
        setProtectedTeams(new Set(data.map(p => p.team_id)))
      }
    } catch (error) {
      console.error('Load protected teams error:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* 현재 상태 */}
      <Card>
        <CardHeader>
          <CardTitle>Score Steal 상태</CardTitle>
        </CardHeader>
        <CardContent>
          {state && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant={state.phase === 'ready_to_steal' ? 'default' : 'secondary'} className="text-lg px-4 py-2">
                  {state.phase === 'active' && '진행 중'}
                  {state.phase === 'waiting_for_bracket' && '브래킷 대기 중'}
                  {state.phase === 'ready_to_steal' && '탈취 준비 완료'}
                </Badge>
              </div>

              {question && (
                <div className="p-4 bg-accent rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">현재 문제</div>
                  <div className="font-semibold">{question.question_text}</div>
                  <div className="text-sm text-muted-foreground mt-2">
                    배점: {question.points}점
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Higher Bracket */}
                <div className={`p-4 rounded-lg ${state.higher_bracket_locked ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {state.higher_bracket_locked ? (
                      <Lock className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Unlock className="h-5 w-5 text-gray-600" />
                    )}
                    <span className="font-semibold text-blue-600">Higher Bracket</span>
                  </div>
                  {state.higher_winner_team_name && (
                    <div className="text-sm">
                      승자: <span className="font-semibold">{state.higher_winner_team_name}</span>
                    </div>
                  )}
                </div>

                {/* Lower Bracket */}
                <div className={`p-4 rounded-lg ${state.lower_bracket_locked ? 'bg-orange-100' : 'bg-gray-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {state.lower_bracket_locked ? (
                      <Lock className="h-5 w-5 text-orange-600" />
                    ) : (
                      <Unlock className="h-5 w-5 text-gray-600" />
                    )}
                    <span className="font-semibold text-orange-600">Lower Bracket</span>
                  </div>
                  {state.lower_winner_team_name && (
                    <div className="text-sm">
                      승자: <span className="font-semibold">{state.lower_winner_team_name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 점수 탈취 대상 선택 */}
      {state?.phase === 'ready_to_steal' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              점수 탈취 대상 선택
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Higher Bracket 대상 */}
              <div className="space-y-3">
                <Label className="text-blue-600 font-semibold">Higher Bracket 대상</Label>
                <Select value={higherTargetTeamId} onValueChange={setHigherTargetTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="팀 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {higherTeams
                      .filter(t => t.id !== state.higher_winner_team_id)
                      .map(team => (
                        <SelectItem key={team.id} value={team.id} disabled={protectedTeams.has(team.id)}>
                          {team.team_name} ({team.score.toLocaleString()}점)
                          {protectedTeams.has(team.id) && ' 🛡️ 보호됨'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lower Bracket 대상 */}
              <div className="space-y-3">
                <Label className="text-orange-600 font-semibold">Lower Bracket 대상</Label>
                <Select value={lowerTargetTeamId} onValueChange={setLowerTargetTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="팀 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {lowerTeams
                      .filter(t => t.id !== state.lower_winner_team_id)
                      .map(team => (
                        <SelectItem key={team.id} value={team.id} disabled={protectedTeams.has(team.id)}>
                          {team.team_name} ({team.score.toLocaleString()}점)
                          {protectedTeams.has(team.id) && ' 🛡️ 보호됨'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <div className="font-semibold mb-1">주의사항</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>각 브래킷에서 1팀씩 선택해야 합니다</li>
                  <li>선택된 팀은 {question?.points}점을 잃습니다</li>
                  <li>승자 팀은 {question?.points}점을 얻습니다</li>
                  <li>🛡️ 표시된 팀은 이전에 점수를 빼앗겨 보호됩니다</li>
                </ul>
              </div>
            </div>

            <Button
              onClick={handleExecuteSteal}
              disabled={loading || !higherTargetTeamId || !lowerTargetTeamId}
              className="w-full"
              size="lg"
            >
              점수 탈취 실행
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
