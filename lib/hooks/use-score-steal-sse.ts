"use client";

import { useState, useEffect, useCallback } from "react";

interface SSEMessage {
  type: 'session_update' | 'new_attempt' | 'team_update' | 'connection_status' | 'ping';
  data?: any;
  status?: string;
  timestamp?: number;
}

interface UseScoreStealSSEProps {
  sessionId: string;
  onSessionUpdate?: (session: any) => void;
  onNewAttempt?: (attempt: any) => void;
  onTeamUpdate?: (team: any) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useScoreStealSSE({
  sessionId,
  onSessionUpdate,
  onNewAttempt,
  onTeamUpdate,
  onConnectionChange,
}: UseScoreStealSSEProps) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;

    console.log(`🔗 Connecting to SSE for session: ${sessionId}`);
    
    const eventSource = new EventSource(`/api/sse/score-steal/${sessionId}`);
    
    eventSource.onopen = () => {
      console.log('✅ SSE connection opened');
      setConnected(true);
      setError(null);
      onConnectionChange?.(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'session_update':
            console.log('📊 SSE: Session updated:', message.data);
            onSessionUpdate?.(message.data);
            break;
            
          case 'new_attempt':
            console.log('🎯 SSE: New attempt:', message.data);
            onNewAttempt?.(message.data);
            break;
            
          case 'team_update':
            console.log('👥 SSE: Team updated:', message.data);
            onTeamUpdate?.(message.data);
            break;
            
          case 'connection_status':
            console.log('📡 SSE: Connection status:', message.status);
            if (message.status === 'connected') {
              setConnected(true);
              onConnectionChange?.(true);
            }
            break;
            
          case 'ping':
            // Keep-alive ping, no action needed
            break;
            
          default:
            console.log('📨 SSE: Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('❌ Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (event) => {
      console.error('❌ SSE connection error:', event);
      setConnected(false);
      setError('Connection error');
      onConnectionChange?.(false);
      
      // 자동 재연결 (3초 후)
      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log('🔄 Attempting to reconnect SSE...');
          connect();
        }
      }, 3000);
    };

    return eventSource;
  }, [sessionId, onSessionUpdate, onNewAttempt, onTeamUpdate, onConnectionChange]);

  useEffect(() => {
    const eventSource = connect();
    
    return () => {
      if (eventSource) {
        console.log('🔌 Closing SSE connection');
        eventSource.close();
        setConnected(false);
        onConnectionChange?.(false);
      }
    };
  }, [connect]);

  return {
    connected,
    error,
    reconnect: connect,
  };
}