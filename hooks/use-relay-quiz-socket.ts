"use client";

import { useEffect, useState } from 'react';
import { useSocket } from '@/lib/socket-context';

export function useRelayQuizSocket(sessionId: string) {
  const { socket, isConnected } = useSocket();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    if (!socket || !isConnected || !sessionId) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 [${timestamp}] Subscribing to Relay Quiz session: ${sessionId}`);

    // 세션 구독
    socket.emit('subscribe:relay-quiz-session', sessionId);

    // 세션 업데이트 리스너
    const handleSessionUpdate = (data: any) => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📊 [${ts}] Relay Quiz session updated:`, {
        id: data.id,
        status: data.status,
        team_progress_count: data.relay_quiz_team_progress?.length || 0
      });
      setSession(data);
    };

    socket.on('relay-quiz:session-update', handleSessionUpdate);

    // Cleanup
    return () => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📡 [${ts}] Unsubscribing from Relay Quiz session: ${sessionId}`);
      socket.emit('unsubscribe:relay-quiz-session', sessionId);
      socket.off('relay-quiz:session-update', handleSessionUpdate);
    };
  }, [socket, isConnected, sessionId]);

  return { 
    session, 
    isConnected
  };
}
