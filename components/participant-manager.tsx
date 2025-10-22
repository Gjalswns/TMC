'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Upload, Download, Plus, Trash2, Users, RotateCcw } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'

interface PreregisteredPlayer {
  id: string
  player_name: string
  player_number: number | null
  team_name: string
  bracket: 'higher' | 'lower'
  is_active: boolean
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

export function ParticipantManager() {
  const [players, setPlayers] = useState<PreregisteredPlayer[]>([])
  const [teams, setTeams] = useState<TeamGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isResettingCheckIns, setIsResettingCheckIns] = useState(false)
  const [newPlayer, setNewPlayer] = useState({
    player_name: '',
    team_name: '',
    bracket: 'higher' as 'higher' | 'lower',
    player_number: ''
  })



  // CSV 파일 업로드
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      // CSV 파싱 (player_name,team_name,bracket,player_number)
      const playersData = lines.slice(1).map(line => {
        const [player_name, team_name, bracket, player_number] = line.split(',').map(s => s.trim())
        return {
          player_name,
          team_name,
          bracket: bracket as 'higher' | 'lower',
          player_number: player_number ? parseInt(player_number) : null
        }
      }).filter(p => p.player_name && p.team_name)

      // DB에 일괄 등록
      const { data, error } = await supabase.rpc('bulk_register_players', {
        p_players: playersData
      })

      if (error) throw error

      alert(`${playersData.length}명의 선수가 등록되었습니다.`)
      await loadTeams()
    } catch (error) {
      console.error('CSV upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'CSV 업로드 실패'
      alert(`CSV 업로드 실패: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // 팀 목록 로드
  const loadTeams = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_preregistered_teams')
      
      if (error) throw error
      setTeams(data || [])
    } catch (error) {
      console.error('Load teams error:', error)
      const errorMessage = error instanceof Error ? error.message : '팀 목록 로드 실패'
      alert(`팀 목록 로드 실패: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // 개별 선수 추가
  const handleAddPlayer = async () => {
    if (!newPlayer.player_name || !newPlayer.team_name) {
      alert('선수 이름과 팀 이름을 입력하세요')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('preregistered_players')
        .insert({
          player_name: newPlayer.player_name,
          team_name: newPlayer.team_name,
          bracket: newPlayer.bracket,
          player_number: newPlayer.player_number ? parseInt(newPlayer.player_number) : null,
          is_active: true
        })

      if (error) throw error

      setNewPlayer({
        player_name: '',
        team_name: '',
        bracket: 'higher',
        player_number: ''
      })
      
      await loadTeams()
    } catch (error) {
      console.error('Add player error:', error)
      alert('선수 추가 실패')
    } finally {
      setLoading(false)
    }
  }

  // 선수 삭제
  const handleDeletePlayer = async (playerId: string) => {
    if (!confirm('이 선수를 삭제하시겠습니까?')) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('preregistered_players')
        .update({ is_active: false })
        .eq('id', playerId)

      if (error) throw error
      await loadTeams()
    } catch (error) {
      console.error('Delete player error:', error)
      alert('선수 삭제 실패')
    } finally {
      setLoading(false)
    }
  }

  // 체크인 초기화 (participants 테이블만 비우기)
  const handleResetCheckIns = async () => {
    setIsResettingCheckIns(true)
    try {
      // 모든 participants 삭제
      const { error } = await supabase
        .from('participants')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // 모든 행 삭제

      if (error) throw error

      alert('모든 체크인이 초기화되었습니다. 학생들이 다시 체크인할 수 있습니다.')
    } catch (error) {
      console.error('Reset check-ins error:', error)
      alert('체크인 초기화 실패')
    } finally {
      setIsResettingCheckIns(false)
    }
  }

  // 모든 선수 리셋
  const handleResetAllPlayers = async () => {
    setIsResetting(true)
    try {
      // 모든 활성 선수를 비활성화
      const { error } = await supabase
        .from('preregistered_players')
        .update({ is_active: false })
        .eq('is_active', true)

      if (error) throw error

      setTeams([])
      alert('모든 선수가 삭제되었습니다.')
    } catch (error) {
      console.error('Reset all players error:', error)
      alert('선수 리셋 실패')
    } finally {
      setIsResetting(false)
    }
  }

  // CSV 템플릿 다운로드
  const downloadTemplate = () => {
    const template = 'player_name,team_name,bracket,player_number\n홍길동,팀A,higher,1\n김철수,팀A,higher,2\n이영희,팀A,higher,3\n박민수,팀A,higher,4\n최영수,팀B,lower,1\n정미영,팀B,lower,2\n강호동,팀B,lower,3\n유재석,팀B,lower,4'
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'players_template.csv'
    a.click()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                참가자 사전 등록
              </CardTitle>
              <CardDescription>
                팀과 선수를 미리 등록하고 게임 입장 시 선택할 수 있습니다
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {/* 체크인 초기화 버튼 */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={isResettingCheckIns}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    체크인 초기화
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>모든 체크인을 초기화하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      게임에 체크인한 모든 학생 정보가 삭제됩니다. 학생들은 다시 체크인할 수 있습니다.
                      (사전 등록된 학생 명단은 유지됩니다)
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetCheckIns}>
                      {isResettingCheckIns ? "초기화 중..." : "초기화"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* 선수 명단 삭제 버튼 */}
              {teams.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={isResetting}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      선수 명단 삭제
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>모든 선수를 삭제하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        등록된 모든 선수가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetAllPlayers}>
                        {isResetting ? "삭제 중..." : "모두 삭제"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CSV 업로드 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="csv-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 p-3 border-2 border-dashed rounded-lg hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  <span>CSV 파일 업로드</span>
                </div>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVUpload}
                  disabled={loading}
                />
              </Label>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              템플릿 다운로드
            </Button>
            <Button onClick={loadTeams} disabled={loading}>
              새로고침
            </Button>
          </div>

          {/* 개별 선수 추가 */}
          <div className="grid grid-cols-5 gap-2">
            <Input
              placeholder="선수 이름"
              value={newPlayer.player_name}
              onChange={(e) => setNewPlayer({ ...newPlayer, player_name: e.target.value })}
            />
            <Input
              placeholder="팀 이름"
              value={newPlayer.team_name}
              onChange={(e) => setNewPlayer({ ...newPlayer, team_name: e.target.value })}
            />
            <Select
              value={newPlayer.bracket}
              onValueChange={(value: 'higher' | 'lower') => 
                setNewPlayer({ ...newPlayer, bracket: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="higher">Higher</SelectItem>
                <SelectItem value="lower">Lower</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="번호"
              value={newPlayer.player_number}
              onChange={(e) => setNewPlayer({ ...newPlayer, player_number: e.target.value })}
            />
            <Button onClick={handleAddPlayer} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 팀 목록 */}
      <div className="grid grid-cols-2 gap-6">
        {/* Higher Bracket */}
        <Card>
          <CardHeader>
            <CardTitle className="text-blue-600">Higher Bracket</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.filter(t => t.bracket === 'higher').map(team => (
                <div key={team.team_name} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{team.team_name}</h3>
                    <Badge>{team.player_count}명</Badge>
                  </div>
                  <div className="space-y-1">
                    {team.players.map(player => (
                      <div key={player.id} className="flex items-center justify-between text-sm">
                        <span>
                          {player.player_number && `#${player.player_number} `}
                          {player.player_name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePlayer(player.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Lower Bracket */}
        <Card>
          <CardHeader>
            <CardTitle className="text-orange-600">Lower Bracket</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.filter(t => t.bracket === 'lower').map(team => (
                <div key={team.team_name} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{team.team_name}</h3>
                    <Badge>{team.player_count}명</Badge>
                  </div>
                  <div className="space-y-1">
                    {team.players.map(player => (
                      <div key={player.id} className="flex items-center justify-between text-sm">
                        <span>
                          {player.player_number && `#${player.player_number} `}
                          {player.player_name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePlayer(player.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
