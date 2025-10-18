import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { gameId, includeParticipants = true, includeTeams = true, includeSessions = true } = await req.json()

    if (!gameId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: gameId' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get comprehensive game state
    const gameState: any = {}

    // Get game info
    const { data: game, error: gameError } = await supabaseClient
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    if (gameError) throw gameError
    gameState.game = game

    // Get participants if requested
    if (includeParticipants) {
      const { data: participants, error: participantsError } = await supabaseClient
        .from('participants')
        .select('*')
        .eq('game_id', gameId)
        .order('joined_at', { ascending: true })

      if (participantsError) throw participantsError
      gameState.participants = participants
    }

    // Get teams if requested
    if (includeTeams) {
      const { data: teams, error: teamsError } = await supabaseClient
        .from('teams')
        .select('*')
        .eq('game_id', gameId)
        .order('team_number', { ascending: true })

      if (teamsError) throw teamsError
      gameState.teams = teams
    }

    // Get active sessions if requested
    if (includeSessions) {
      // Year Game Session
      const { data: yearGameSession } = await supabaseClient
        .from('year_game_sessions')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round)
        .single()

      // Score Steal Session
      const { data: scoreStealSession } = await supabaseClient
        .from('score_steal_sessions')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round)
        .single()

      // Relay Quiz Session
      const { data: relayQuizSession } = await supabaseClient
        .from('relay_quiz_sessions')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round)
        .single()

      gameState.sessions = {
        yearGame: yearGameSession,
        scoreSteal: scoreStealSession,
        relayQuiz: relayQuizSession
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        gameState,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error syncing game state:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to sync game state',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
