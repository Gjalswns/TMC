/**
 * ==============================================================
 * SAFE REALTIME HOOK
 * ==============================================================
 * Memory-safe Realtime hook with automatic cleanup and reconnection
 * Prevents memory leaks and handles connection errors gracefully
 * 
 * Features:
 * - Automatic channel cleanup on unmount
 * - Memory leak prevention
 * - Exponential backoff reconnection
 * - Connection health monitoring
 * - Automatic channel recovery
 * - Broadcast acknowledgment
 * 
 * @version 1.0.0
 * @date 2025-10-18
 * ==============================================================
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel, RealtimeChannelSendResponse } from '@supabase/supabase-js';

// ==============================================================
// TYPES
// ==============================================================

export interface RealtimeSafeOptions {
  channelName: string;
  gameId?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (event: string, payload: any) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  isConnected: boolean;
  reconnectAttempts: number;
  lastError?: string;
  lastHeartbeat?: Date;
}

export interface RealtimeSafeReturn {
  connectionState: ConnectionState;
  broadcast: (event: string, payload: any) => Promise<RealtimeChannelSendResponse>;
  subscribe: (event: string, callback: (payload: any) => void) => void;
  unsubscribe: (event: string) => void;
  reconnect: () => void;
  disconnect: () => void;
}

// ==============================================================
// CONSTANTS
// ==============================================================

const DEFAULT_RECONNECT_DELAY = 2000; // 2 seconds
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30 seconds

// ==============================================================
// HOOK
// ==============================================================

export function useRealtimeSafe(options: RealtimeSafeOptions): RealtimeSafeReturn {
  const {
    channelName,
    gameId,
    onConnect,
    onDisconnect,
    onError,
    onMessage,
    autoReconnect = true,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
  } = options;

  // ==============================================================
  // STATE
  // ==============================================================

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    isConnected: false,
    reconnectAttempts: 0,
  });

  // ==============================================================
  // REFS (Prevent memory leaks)
  // ==============================================================

  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventCallbacksRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const isCleaningUpRef = useRef(false);
  const isMountedRef = useRef(true);

  // ==============================================================
  // CLEANUP UTILITIES
  // ==============================================================

  const clearTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const cleanupChannel = useCallback(async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    console.log(`[RealtimeSafe] Cleaning up channel: ${channelName}`);

    clearTimeouts();

    if (channelRef.current) {
      try {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      } catch (error) {
        console.error(`[RealtimeSafe] Error removing channel:`, error);
      }
    }

    eventCallbacksRef.current.clear();
    isCleaningUpRef.current = false;
  }, [channelName, clearTimeouts]);

  // ==============================================================
  // HEARTBEAT
  // ==============================================================

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;

    heartbeatIntervalRef.current = setInterval(() => {
      if (!channelRef.current || !isMountedRef.current) return;

      setConnectionState(prev => ({
        ...prev,
        lastHeartbeat: new Date(),
      }));

      // Send heartbeat ping
      channelRef.current.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: { timestamp: Date.now() },
      });
    }, heartbeatInterval);
  }, [heartbeatInterval]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // ==============================================================
  // RECONNECTION LOGIC
  // ==============================================================

  const scheduleReconnect = useCallback((attemptNumber: number) => {
    if (!autoReconnect || attemptNumber >= maxReconnectAttempts) {
      console.log(`[RealtimeSafe] Max reconnect attempts reached`);
      setConnectionState(prev => ({
        ...prev,
        status: 'error',
        lastError: 'Max reconnect attempts reached',
      }));
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      reconnectDelay * Math.pow(2, attemptNumber) + Math.random() * 1000,
      MAX_RECONNECT_DELAY
    );

    console.log(`[RealtimeSafe] Scheduling reconnect in ${delay}ms (attempt ${attemptNumber + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connect();
      }
    }, delay);
  }, [autoReconnect, maxReconnectAttempts, reconnectDelay]);

  // ==============================================================
  // CONNECTION
  // ==============================================================

  const connect = useCallback(async () => {
    if (isCleaningUpRef.current || !isMountedRef.current) return;

    await cleanupChannel();

    console.log(`[RealtimeSafe] Connecting to channel: ${channelName}`);

    setConnectionState(prev => ({
      ...prev,
      status: 'connecting',
      isConnected: false,
    }));

    try {
      // Create new channel with configuration
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: {
            self: true,
            ack: true,
          },
          presence: {
            key: gameId || channelName,
          },
        },
      });

      // Set up event listeners
      channel
        .on('broadcast', { event: '*' }, ({ event, payload }) => {
          if (onMessage && event !== 'heartbeat') {
            onMessage(event, payload);
          }
          
          // Trigger specific callbacks
          const callbacks = eventCallbacksRef.current.get(event);
          if (callbacks) {
            callbacks.forEach(callback => callback(payload));
          }
        })
        .on('presence', { event: 'sync' }, () => {
          console.log(`[RealtimeSafe] Presence synced`);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log(`[RealtimeSafe] User joined:`, key);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log(`[RealtimeSafe] User left:`, key);
        });

      // Subscribe to channel
      const status = await channel.subscribe(async (status, err) => {
        if (!isMountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeSafe] Successfully subscribed to ${channelName}`);
          
          setConnectionState({
            status: 'connected',
            isConnected: true,
            reconnectAttempts: 0,
            lastHeartbeat: new Date(),
          });

          startHeartbeat();
          onConnect?.();
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[RealtimeSafe] Channel error:`, err);
          
          setConnectionState(prev => ({
            ...prev,
            status: 'error',
            isConnected: false,
            lastError: err?.message || 'Channel error',
          }));

          onError?.(new Error(err?.message || 'Channel error'));
          stopHeartbeat();
          scheduleReconnect(connectionState.reconnectAttempts);
        } else if (status === 'TIMED_OUT') {
          console.error(`[RealtimeSafe] Connection timed out`);
          
          setConnectionState(prev => ({
            ...prev,
            status: 'error',
            isConnected: false,
            reconnectAttempts: prev.reconnectAttempts + 1,
            lastError: 'Connection timed out',
          }));

          stopHeartbeat();
          scheduleReconnect(connectionState.reconnectAttempts);
        } else if (status === 'CLOSED') {
          console.log(`[RealtimeSafe] Connection closed`);
          
          setConnectionState(prev => ({
            ...prev,
            status: 'disconnected',
            isConnected: false,
          }));

          stopHeartbeat();
          onDisconnect?.();
        }
      });

      channelRef.current = channel;

    } catch (error) {
      console.error(`[RealtimeSafe] Connection error:`, error);
      
      const err = error as Error;
      setConnectionState(prev => ({
        ...prev,
        status: 'error',
        isConnected: false,
        reconnectAttempts: prev.reconnectAttempts + 1,
        lastError: err.message,
      }));

      onError?.(err);
      scheduleReconnect(connectionState.reconnectAttempts);
    }
  }, [
    channelName,
    gameId,
    onConnect,
    onDisconnect,
    onError,
    onMessage,
    cleanupChannel,
    startHeartbeat,
    stopHeartbeat,
    scheduleReconnect,
    connectionState.reconnectAttempts,
  ]);

  // ==============================================================
  // PUBLIC API
  // ==============================================================

  const broadcast = useCallback(async (event: string, payload: any): Promise<RealtimeChannelSendResponse> => {
    if (!channelRef.current) {
      throw new Error('Channel not connected');
    }

    return channelRef.current.send({
      type: 'broadcast',
      event,
      payload: {
        ...payload,
        timestamp: Date.now(),
        gameId,
      },
    });
  }, [gameId]);

  const subscribe = useCallback((event: string, callback: (payload: any) => void) => {
    if (!eventCallbacksRef.current.has(event)) {
      eventCallbacksRef.current.set(event, new Set());
    }
    eventCallbacksRef.current.get(event)!.add(callback);
  }, []);

  const unsubscribe = useCallback((event: string) => {
    eventCallbacksRef.current.delete(event);
  }, []);

  const reconnect = useCallback(() => {
    console.log(`[RealtimeSafe] Manual reconnect triggered`);
    setConnectionState(prev => ({ ...prev, reconnectAttempts: 0 }));
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    console.log(`[RealtimeSafe] Manual disconnect triggered`);
    clearTimeouts();
    stopHeartbeat();
    cleanupChannel();
  }, [clearTimeouts, stopHeartbeat, cleanupChannel]);

  // ==============================================================
  // LIFECYCLE
  // ==============================================================

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      console.log(`[RealtimeSafe] Component unmounting, cleaning up`);
      isMountedRef.current = false;
      clearTimeouts();
      stopHeartbeat();
      cleanupChannel();
    };
  }, [channelName]); // Only reconnect when channel name changes

  // ==============================================================
  // RETURN
  // ==============================================================

  return {
    connectionState,
    broadcast,
    subscribe,
    unsubscribe,
    reconnect,
    disconnect,
  };
}

// ==============================================================
// EXPORT
// ==============================================================

export default useRealtimeSafe;
