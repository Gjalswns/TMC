"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '@/lib/socket-context';

export function useScoreStealSocket(sessionId: string) {
  const { socket, isConnected } = useSocket();
  const [session, setSession] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);

  useEffect(() => {
    if (!socket || !isConnected || !sessionId) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 [${timestamp}] Subscribing to Score Steal session: ${sessionId}`);

    // 세션 구독
    socket.emit('subscribe:score-steal-session', sessionId);

    // 세션 업데이트 리스너
    const handleSessionUpdate = (data: any) => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📊 [${ts}] Score Steal session updated:`, {
        id: data.id,
        phase: data.phase,
        status: data.status,
        current_question_id: data.current_question_id,
        has_question: !!data.score_steal_questions
      });
      setSession(data);
    };

    // 시도 기록 업데이트 리스너
    const handleAttemptsUpdate = (data: any[]) => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📊 [${ts}] Score Steal attempts updated: ${data.length} attempts`);
      setAttempts(data);
    };

    socket.on('score-steal:session-update', handleSessionUpdate);
    socket.on('score-steal:attempts-update', handleAttemptsUpdate);

    // 시도 기록 요청
    socket.emit('score-steal:request-attempts', sessionId);

    // Cleanup
    return () => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📡 [${ts}] Unsubscribing from Score Steal session: ${sessionId}`);
      socket.emit('unsubscribe:score-steal-session', sessionId);
      socket.off('score-steal:session-update', handleSessionUpdate);
      socket.off('score-steal:attempts-update', handleAttemptsUpdate);
    };
  }, [socket, isConnected, sessionId]);

  // 시도 기록 새로고침 함수
  const refreshAttempts = useCallback(() => {
    if (socket && isConnected && sessionId) {
      socket.emit('score-steal:request-attempts', sessionId);
    }
  }, [socket, isConnected, sessionId]);

  return { 
    session, 
    attempts, 
    isConnected,
    refreshAttempts
  };
}
