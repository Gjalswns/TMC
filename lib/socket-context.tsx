"use client";

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connectionError: null,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🔧 Initializing Socket.IO client...');

    // Socket.IO 클라이언트 초기화
    const socketInstance = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'], // WebSocket 우선, 폴백으로 폴링
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socketInstance.on('connect', () => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`✅ [${timestamp}] Socket connected:`, socketInstance.id);
      setIsConnected(true);
      setConnectionError(null);
    });

    socketInstance.on('disconnect', (reason) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`❌ [${timestamp}] Socket disconnected:`, reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // 서버가 연결을 끊은 경우 재연결 시도
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (error) => {
      const timestamp = new Date().toLocaleTimeString();
      console.error(`❌ [${timestamp}] Socket connection error:`, error.message);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`✅ [${timestamp}] Socket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setConnectionError(null);
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`🔄 [${timestamp}] Reconnection attempt ${attemptNumber}...`);
    });

    socketInstance.on('reconnect_error', (error) => {
      const timestamp = new Date().toLocaleTimeString();
      console.error(`❌ [${timestamp}] Reconnection error:`, error.message);
    });

    socketInstance.on('reconnect_failed', () => {
      const timestamp = new Date().toLocaleTimeString();
      console.error(`❌ [${timestamp}] Failed to reconnect after all attempts`);
      setConnectionError('Failed to reconnect to server');
    });

    // Pong 응답 처리
    socketInstance.on('pong', (data) => {
      console.log('🏓 Pong received:', data);
    });

    // 에러 처리
    socketInstance.on('error', (error) => {
      console.error('❌ Socket error:', error);
      setConnectionError(error.message || 'Socket error occurred');
    });

    setSocket(socketInstance);

    // Cleanup
    return () => {
      console.log('🔌 Disconnecting socket...');
      socketInstance.disconnect();
    };
  }, []);

  // Ping 전송 (연결 상태 확인)
  useEffect(() => {
    if (!socket || !isConnected) return;

    const pingInterval = setInterval(() => {
      socket.emit('ping');
    }, 30000); // 30초마다

    return () => clearInterval(pingInterval);
  }, [socket, isConnected]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionError }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};
