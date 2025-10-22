'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useYearGameSessionUpdates, useYearGameResultsUpdates } from '@/hooks/use-realtime'
import type { Database } from '@/lib/database.types'

type Team = Database['public']['Tables']['teams']['Row']

interface YearGameSession {
  id: string;
  game_id: string;
  round_number: number;
  target_numbers: number[];
  time_limit_seconds: number;
  status: "waiting" | "active" | "finished";
  started_at?: string;
  ended_at?: string;
  year_game_results?: Array<{
    id: string;
    team_id: string;
    numbers_found: number[];
    total_found: number;
    score: number;
    teams: {
      id: string;
      team_name: string;
      team_number: number;
      score: number;
      bracket: 'higher' | 'lower' | null;
    };
  }>;
}

interface CleanScoreboardProps {
  gameId: string
}

export function CleanScoreboard({ gameId }: CleanScoreboardProps) {
  const [session, setSession] = useState<YearGameSession | null>(null)
  const [teams, setTeams] = useState<Team[]>([])

  // Load Year Game session with results (관리자 페이지와 동일한 로직)
  const loadSession = useCallback(async () => {
    if (!gameId) return

    try {
      console.log('🔄 Loading Year Game session for scoreboard...', gameId)
      
      const { data: sessionData, error: sessionError } = await supabase
        .from("year_game_sessions")
        .select(`
          *,
          year_game_results (
            *,
            teams (
              id,
              team_name,
              team_number,
              score,
              bracket
            )
          )
        `)
        .eq("game_id", gameId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sessionError) {
        console.error('❌ Session load error:', sessionError)
        return
      }

      if (sessionData) {
        console.log('✅ Year Game session loaded with results:', sessionData.year_game_results?.length || 0)
        setSession(sessionData)
        
        // Extract teams from session results
        if (sessionData.year_game_results) {
          const teamsFromResults = sessionData.year_game_results.map(result => ({
            ...result.teams,
            score: result.score // Use score from year_game_results
          }))
          setTeams(teamsFromResults)
        }
      } else {
        // Fallback to regular teams table if no active session
        console.log('⚠️ No active Year Game session, loading teams from teams table')
        const { data: teamsData } = await supabase
          .from('teams')
          .select('*')
          .eq('game_id', gameId)
          .order('score', { ascending: false })
        
        if (teamsData) {
          setTeams(teamsData)
        }
      }
    } catch (error) {
      console.error('❌ Load session error:', error)
    }
  }, [gameId])

  // 관리자 페이지와 동일한 실시간 업데이트 핸들러
  const handleSessionUpdate = useCallback(
    (updatedSession: any) => {
      console.log('🎯 Year Game session updated via websocket:', updatedSession)
      if (updatedSession.id === session?.id) {
        setSession(updatedSession)
      }
    },
    [session?.id]
  )

  const handleResultsUpdate = useCallback(
    (updatedResult: any) => {
      console.log('📊 Year Game result updated via websocket:', updatedResult)
      setSession((prev) => {
        if (!prev || !prev.year_game_results) {
          console.log('⚠️ No session or results to update')
          return prev
        }

        // Find and update the specific result
        const existingIndex = prev.year_game_results.findIndex(
          (result) => result.id === updatedResult.id
        )

        if (existingIndex !== -1) {
          // Update existing result
          const updatedResults = [...prev.year_game_results]
          updatedResults[existingIndex] = {
            ...updatedResults[existingIndex],
            ...updatedResult,
          }
          console.log('✅ Updated result at index:', existingIndex)
          
          // Update teams state with new scores
          const teamsFromResults = updatedResults.map(result => ({
            ...result.teams,
            score: result.score
          }))
          setTeams(teamsFromResults)
          
          return { ...prev, year_game_results: updatedResults }
        } else {
          // Add new result if not found
          console.log('➕ Adding new result to session')
          const newResults = [...prev.year_game_results, updatedResult]
          
          // Update teams state
          const teamsFromResults = newResults.map(result => ({
            ...result.teams,
            score: result.score
          }))
          setTeams(teamsFromResults)
          
          return {
            ...prev,
            year_game_results: newResults,
          }
        }
      })
    },
    []
  )

  // 관리자 페이지와 동일한 실시간 업데이트 훅 사용
  useYearGameSessionUpdates(gameId, handleSessionUpdate)
  useYearGameResultsUpdates(session?.id || "", handleResultsUpdate)

  useEffect(() => {
    loadSession()
  }, [loadSession])

  // 폴링 백업 (5초마다)
  useEffect(() => {
    if (!gameId) return

    const interval = setInterval(() => {
      console.log('🔄 Polling session update...')
      loadSession()
    }, 5000)

    return () => {
      clearInterval(interval)
    }
  }, [gameId, loadSession])

  const higherTeams = teams
    .filter(t => t.bracket === 'higher')
    .sort((a, b) => b.score - a.score)

  const lowerTeams = teams
    .filter(t => t.bracket === 'lower')
    .sort((a, b) => b.score - a.score)

  const renderBracket = (bracketTeams: Team[], title: string, color: string) => {
    return (
      <div className="flex-1 flex flex-col h-full">
        {/* 헤더 */}
        <div className={`${color} text-white py-6 text-center shadow-lg`}>
          <h1 className="text-5xl font-black tracking-widest drop-shadow-lg">{title}</h1>
        </div>

        {/* 팀 목록 */}
        <div className="flex-1 bg-gradient-to-b from-gray-50 to-white p-6 space-y-3 overflow-y-auto">
          {bracketTeams.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-300 text-2xl font-light">
              팀이 없습니다
            </div>
          ) : (
            bracketTeams.map((team, index) => (
              <div
                key={team.id}
                className={`
                  flex items-center justify-between p-4 rounded-2xl transition-all duration-500
                  ${index === 0 
                    ? `${color} text-white shadow-xl transform scale-102 border-2 border-white` 
                    : 'bg-white shadow-md hover:shadow-lg border border-gray-200'
                  }
                `}
              >
                {/* 순위 */}
                <div className={`
                  w-16 h-16 rounded-full flex items-center justify-center text-3xl font-black
                  ${index === 0 
                    ? 'bg-white bg-opacity-25 backdrop-blur-sm' 
                    : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700'
                  }
                `}>
                  {index + 1}
                </div>

                {/* 팀 이름 */}
                <div className="flex-1 mx-6">
                  <div className={`text-3xl font-black tracking-tight ${index === 0 ? '' : 'text-gray-900'}`}>
                    {team.team_name}
                  </div>
                </div>

                {/* 점수 */}
                <div className="text-right">
                  <div className={`text-4xl font-black tabular-nums tracking-tighter ${index === 0 ? '' : 'text-gray-900'}`}>
                    {team.score.toLocaleString()}
                  </div>
                  <div className={`text-lg font-medium ${index === 0 ? 'text-white text-opacity-90' : 'text-gray-500'}`}>
                    점
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex bg-gray-200">
      {/* Higher Bracket - 왼쪽 */}
      {renderBracket(higherTeams, 'HIGHER', 'bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900')}

      {/* 중앙 구분선 */}
      <div className="w-2 bg-gradient-to-b from-gray-400 via-gray-500 to-gray-400 shadow-xl"></div>

      {/* Lower Bracket - 오른쪽 */}
      {renderBracket(lowerTeams, 'LOWER', 'bg-gradient-to-br from-orange-600 via-orange-700 to-orange-900')}
    </div>
  )
}
