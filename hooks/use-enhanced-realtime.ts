import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface EnhancedRealtimeOptions {
  gameId: string
  onGameUpdate?: (game: any) => void
  onParticipantUpdate?: (participant: any) => void
  onTeamUpdate?: (team: any) => void
  onSessionUpdate?: (session: any) => void
  onError?: (error: Error) => void
  onReconnect?: () => void
  fallbackInterval?: number // Polling interval in ms when websocket fails
}

interface ConnectionStatus {
  isConnected: boolean
  isReconnecting: boolean
  lastError?: string
  reconnectAttempts: number
}

export function useEnhancedRealtime(options: EnhancedRealtimeOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isReconnecting: false,
    reconnectAttempts: 0
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const maxReconnectAttempts = 5
  const reconnectDelay = 2000

  // Fallback polling function
  const startFallbackPolling = useCallback(async () => {
    if (fallbackIntervalRef.current) return

    console.log('🔄 Starting fallback polling...')
    
    fallbackIntervalRef.current = setInterval(async () => {
      try {
        // Fetch game data directly from Supabase instead of edge function
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('id', options.gameId)
          .single();

        if (!gameError && game) {
          options.onGameUpdate?.(game);
        }

        const { data: participants, error: participantsError } = await supabase
          .from('participants')
          .select('*')
          .eq('game_id', options.gameId);

        if (!participantsError && participants) {
          participants.forEach((p) => options.onParticipantUpdate?.(p));
        }

        const { data: teams, error: teamsError } = await supabase
          .from('teams')
          .select('*')
          .eq('game_id', options.gameId);

        if (!teamsError && teams) {
          teams.forEach((t) => options.onTeamUpdate?.(t));
        }
      } catch (error) {
        console.error('❌ Fallback polling error:', error)
      }
    }, options.fallbackInterval || 5000)
  }, [options])

  // Stop fallback polling
  const stopFallbackPolling = useCallback(() => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current)
      fallbackIntervalRef.current = null
      console.log('⏹️ Stopped fallback polling')
    }
  }, [])

  // Reconnect logic
  const attemptReconnect = useCallback(() => {
    if (connectionStatus.reconnectAttempts >= maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached, starting fallback polling')
      startFallbackPolling()
      return
    }

    setConnectionStatus(prev => ({
      ...prev,
      isReconnecting: true,
      reconnectAttempts: prev.reconnectAttempts + 1
    }))

    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`🔄 Attempting reconnection (${connectionStatus.reconnectAttempts + 1}/${maxReconnectAttempts})`)
      setupWebSocket()
    }, reconnectDelay * Math.pow(2, connectionStatus.reconnectAttempts)) // Exponential backoff
  }, [connectionStatus.reconnectAttempts])

  // Setup websocket connection
  const setupWebSocket = useCallback(() => {
    if (!isSupabaseConfigured()) {
      console.warn("⚠️ Supabase is not configured. Starting fallback polling...");
      startFallbackPolling();
      return;
    }

    // Clean up existing connection
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channelName = `game-${options.gameId}-${Date.now()}`
    
    channelRef.current = supabase
      .channel(channelName)
      .on('broadcast', { event: 'game-update' }, (payload) => {
        console.log('📡 Received game update via broadcast:', payload)
        if (payload.data) {
          options.onGameUpdate?.(payload.data)
        }
      })
      .on('broadcast', { event: 'participant-update' }, (payload) => {
        console.log('📡 Received participant update via broadcast:', payload)
        if (payload.data) {
          options.onParticipantUpdate?.(payload.data)
        }
      })
      .on('broadcast', { event: 'team-update' }, (payload) => {
        console.log('📡 Received team update via broadcast:', payload)
        if (payload.data) {
          options.onTeamUpdate?.(payload.data)
        }
      })
      .on('broadcast', { event: 'session-update' }, (payload) => {
        console.log('📡 Received session update via broadcast:', payload)
        if (payload.data) {
          options.onSessionUpdate?.(payload.data)
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${options.gameId}`
      }, (payload) => {
        console.log('📡 Received game change via postgres:', payload)
        options.onGameUpdate?.(payload.new)
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `game_id=eq.${options.gameId}`
      }, (payload) => {
        console.log('📡 Received participant change via postgres:', payload)
        options.onParticipantUpdate?.(payload.new)
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'teams',
        filter: `game_id=eq.${options.gameId}`
      }, (payload) => {
        console.log('📡 Received team change via postgres:', payload)
        options.onTeamUpdate?.(payload.new)
      })
      .subscribe((status) => {
        console.log(`📡 WebSocket status for game ${options.gameId}:`, status)
        
        if (status === 'SUBSCRIBED') {
          setConnectionStatus({
            isConnected: true,
            isReconnecting: false,
            reconnectAttempts: 0
          })
          stopFallbackPolling()
          options.onReconnect?.()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus(prev => ({
            ...prev,
            isConnected: false,
            lastError: status
          }))
          
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            attemptReconnect()
          }
        }
      })
  }, [options, attemptReconnect, stopFallbackPolling])

  // Initialize connection
  useEffect(() => {
    setupWebSocket()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      stopFallbackPolling()
    }
  }, [setupWebSocket, stopFallbackPolling])

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setConnectionStatus(prev => ({ ...prev, reconnectAttempts: 0 }))
    attemptReconnect()
  }, [attemptReconnect])

  // Broadcast event function
  const broadcastEvent = useCallback(async (eventType: string, data: any, targetUsers?: string[]) => {
    if (!isSupabaseConfigured()) {
      console.warn("⚠️ Supabase is not configured. Cannot broadcast events.");
      return { success: false, error: "Supabase not configured" };
    }

    try {
      // Use Supabase Realtime broadcast instead of edge function
      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: eventType,
          payload: data
        });
        return { success: true };
      } else {
        throw new Error("No active channel to broadcast to");
      }
    } catch (error) {
      console.error('❌ Failed to broadcast event:', error)
      options.onError?.(error as Error)
      return { success: false, error: (error as Error).message };
    }
  }, [options])

  return {
    connectionStatus,
    reconnect,
    broadcastEvent,
    isConnected: connectionStatus.isConnected,
    isReconnecting: connectionStatus.isReconnecting,
    lastError: connectionStatus.lastError
  }
}
