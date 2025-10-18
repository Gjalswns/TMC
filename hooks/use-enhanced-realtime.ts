import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
        const response = await fetch('/api/supabase/functions/sync-game-state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.supabaseKey}`
          },
          body: JSON.stringify({
            gameId: options.gameId,
            includeParticipants: true,
            includeTeams: true,
            includeSessions: true
          })
        })

        if (response.ok) {
          const { gameState } = await response.json()
          
          // Trigger callbacks with fresh data
          if (gameState.game) options.onGameUpdate?.(gameState.game)
          if (gameState.participants) {
            gameState.participants.forEach((p: any) => options.onParticipantUpdate?.(p))
          }
          if (gameState.teams) {
            gameState.teams.forEach((t: any) => options.onTeamUpdate?.(t))
          }
          if (gameState.sessions) {
            Object.values(gameState.sessions).forEach((s: any) => {
              if (s) options.onSessionUpdate?.(s)
            })
          }
        }
      } catch (error) {
        console.error('Fallback polling error:', error)
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
    try {
      const response = await fetch('/api/supabase/functions/broadcast-game-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`
        },
        body: JSON.stringify({
          gameId: options.gameId,
          eventType,
          data,
          targetUsers
        })
      })

      if (!response.ok) {
        throw new Error(`Broadcast failed: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to broadcast event:', error)
      options.onError?.(error as Error)
      throw error
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
