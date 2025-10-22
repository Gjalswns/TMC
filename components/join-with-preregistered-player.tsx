'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Users, LogIn } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validateGameCode } from '@/lib/validation'
import { VALIDATION_MESSAGES } from '@/lib/constants'

interface PreregisteredPlayer {
  id: string
  player_name: string
  player_number: number | null
  team_name: string
  bracket: 'higher' | 'lower'
}

interface TeamGroup {
  team_name: string
  bracket: 'higher' | 'lower'
  player_count: number
  players: Array<{
    id: string
    player_name: string
    player_number: number | null
  }>
}

export function JoinWithPreregisteredPlayer() {
  const router = useRouter()
  const [gameCode, setGameCode] = useState('')
  const [teams, setTeams] = useState<TeamGroup[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingTeams, setLoadingTeams] = useState(false)
  


  // 팀 목록 로드
  useEffect(() => {
    loadTeams()
  }, [])

  const loadTeams = async () => {
    setLoadingTeams(true)
    try {
      const { data, error } = await supabase.rpc('get_preregistered_teams')
      
      if (error) throw error
      setTeams(data || [])
    } catch (error) {
      console.error('Load teams error:', error)
    } finally {
      setLoadingTeams(false)
    }
  }

  const handleJoin = async () => {
    // 게임 코드 검증
    const codeValidation = validateGameCode(gameCode)
    if (!codeValidation.isValid) {
      alert(codeValidation.message)
      return
    }

    // 선수 선택 검증
    if (!selectedPlayerId) {
      alert(VALIDATION_MESSAGES.PLAYER_REQUIRED)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('join_game_with_preregistered_player', {
        p_game_code: gameCode,
        p_player_id: selectedPlayerId
      })

      if (error) throw error

      const result = data[0]
      if (!result.success) {
        alert(result.message)
        return
      }

      // 게임 페이지로 이동
      router.push(`/game/${result.game_id}?participant=${result.participant_id}`)
    } catch (error) {
      console.error('Join game error:', error)
      alert('게임 참가 실패')
    } finally {
      setLoading(false)
    }
  }

  // 선택된 선수 정보
  const selectedPlayer = teams
    .flatMap(t => t.players)
    .find(p => p.id === selectedPlayerId)

  const selectedTeam = teams.find(t => 
    t.players.some(p => p.id === selectedPlayerId)
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            게임 참가
          </CardTitle>
          <CardDescription>
            게임 코드를 입력하고 본인을 선택하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 게임 코드 입력 */}
          <div className="space-y-2">
            <Label htmlFor="game-code">게임 코드 (2자리 숫자)</Label>
            <Input
              id="game-code"
              type="text"
              placeholder="예: 23, 79"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.slice(0, 2))}
              maxLength={2}
              className="text-2xl text-center font-bold"
            />
          </div>

          {/* 선수 선택 */}
          <div className="space-y-4">
            <Label>선수 선택</Label>
            
            {loadingTeams ? (
              <div className="text-center py-8 text-muted-foreground">
                로딩 중...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Higher Bracket */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-blue-600 flex items-center gap-2">
                    Higher Bracket
                    <Badge variant="outline">{teams.filter(t => t.bracket === 'higher').length}팀</Badge>
                  </h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {teams.filter(t => t.bracket === 'higher').map(team => (
                      <div key={team.team_name} className="border rounded-lg p-3">
                        <div className="font-medium mb-2">{team.team_name}</div>
                        <div className="space-y-1">
                          {team.players.map(player => (
                            <button
                              key={player.id}
                              onClick={() => setSelectedPlayerId(player.id)}
                              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                selectedPlayerId === player.id
                                  ? 'bg-blue-500 text-white'
                                  : 'hover:bg-accent'
                              }`}
                            >
                              {player.player_number && `#${player.player_number} `}
                              {player.player_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lower Bracket */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-orange-600 flex items-center gap-2">
                    Lower Bracket
                    <Badge variant="outline">{teams.filter(t => t.bracket === 'lower').length}팀</Badge>
                  </h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {teams.filter(t => t.bracket === 'lower').map(team => (
                      <div key={team.team_name} className="border rounded-lg p-3">
                        <div className="font-medium mb-2">{team.team_name}</div>
                        <div className="space-y-1">
                          {team.players.map(player => (
                            <button
                              key={player.id}
                              onClick={() => setSelectedPlayerId(player.id)}
                              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                selectedPlayerId === player.id
                                  ? 'bg-orange-500 text-white'
                                  : 'hover:bg-accent'
                              }`}
                            >
                              {player.player_number && `#${player.player_number} `}
                              {player.player_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 선택 정보 */}
          {selectedPlayer && selectedTeam && (
            <div className="p-4 bg-accent rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">선택된 정보</div>
              <div className="font-semibold">
                {selectedTeam.team_name} - {selectedPlayer.player_name}
                <Badge className="ml-2" variant={selectedTeam.bracket === 'higher' ? 'default' : 'secondary'}>
                  {selectedTeam.bracket === 'higher' ? 'Higher' : 'Lower'}
                </Badge>
              </div>
            </div>
          )}

          {/* 참가 버튼 */}
          <Button
            onClick={handleJoin}
            disabled={loading || !gameCode || !selectedPlayerId}
            className="w-full"
            size="lg"
          >
            <LogIn className="h-5 w-5 mr-2" />
            {loading ? '참가 중...' : '게임 참가'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
