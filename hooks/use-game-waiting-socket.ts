"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '@/lib/socket-context';

interface GameWaitingData {
  game: any;
  participantCount: number;
}

export function useGameWaitingSocket(gameId: string, participantId?: string) {
  const { socket, isConnected } = useSocket();
  const [gameData, setGameData] = useState<GameWaitingData | null>(null);
  const [teamInfo, setTeamInfo] = useState<{
    teamName: string;
    teamMembers: string[];
  } | null>(null);

  useEffect(() => {
    if (!socket || !isConnected || !gameId) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 [${timestamp}] Subscribing to game waiting room: ${gameId}`);

    // 게임 대기실 구독
    socket.emit('subscribe:game-waiting', gameId);

    // 게임 업데이트 리스너
    const handleGameUpdate = (data: GameWaitingData) => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📊 [${ts}] Game waiting room updated:`, {
        gameId: data.game?.id,
        status: data.game?.status,
        currentRound: data.game?.current_round,
        participantCount: data.participantCount
      });
      setGameData(data);
    };

    // 참가자 업데이트 리스너
    const handleParticipantUpdate = (participant: any) => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📊 [${ts}] Participant updated:`, participant);
      
      // 내 참가자 정보가 업데이트되면 팀 정보 요청
      if (participant.id === participantId && participant.team_id) {
        socket.emit('game-waiting:request-team-info', {
          gameId,
          teamId: participant.team_id
        });
      }
    };

    // 팀 정보 리스너
    const handleTeamInfo = (data: { teamName: string; teamMembers: string[] }) => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📊 [${ts}] Team info received:`, data);
      setTeamInfo(data);
    };

    socket.on('game-waiting:update', handleGameUpdate);
    socket.on('game-waiting:participant-updated', handleParticipantUpdate);
    socket.on('game-waiting:team-info', handleTeamInfo);

    // Cleanup
    return () => {
      const ts = new Date().toLocaleTimeString();
      console.log(`📡 [${ts}] Unsubscribing from game waiting room: ${gameId}`);
      socket.emit('unsubscribe:game-waiting', gameId);
      socket.off('game-waiting:update', handleGameUpdate);
      socket.off('game-waiting:participant-updated', handleParticipantUpdate);
      socket.off('game-waiting:team-info', handleTeamInfo);
    };
  }, [socket, isConnected, gameId, participantId]);

  // 팀 정보 요청 함수
  const requestTeamInfo = useCallback((teamId: string) => {
    if (socket && isConnected) {
      socket.emit('game-waiting:request-team-info', { gameId, teamId });
    }
  }, [socket, isConnected, gameId]);

  return {
    game: gameData?.game,
    participantCount: gameData?.participantCount || 0,
    teamInfo,
    isConnected,
    requestTeamInfo
  };
}
