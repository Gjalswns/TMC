/**
 * Safe Realtime Hook with Memory Leak Prevention
 * 
 * This hook provides improved memory management and connection handling
 * for Supabase Realtime subscriptions in multi-user scenarios.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

interface RealtimeSubscriptionOptions {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onAny?: (payload: any) => void;
  enabled?: boolean; // Allow disabling subscription
}

interface ConnectionStats {
  isConnected: boolean;
  subscriptionStatus: string;
  errorCount: number;
  lastError: string | null;
  reconnectAttempts: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000; // ms
const MAX_ERROR_COUNT = 10;

/**
 * Enhanced useRealtime hook with memory leak prevention
 */
export function useRealtimeSafe(options: RealtimeSubscriptionOptions) {
  const [stats, setStats] = useState<ConnectionStats>({
    isConnected: false,
    subscriptionStatus: "CLOSED",
    errorCount: 0,
    lastError: null,
    reconnectAttempts: 0,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);
  const callbacksRef = useRef(options);

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (channelRef.current) {
      try {
        console.log(`🧹 Cleaning up channel for table: ${options.table}`);
        supabase.removeChannel(channelRef.current);
      } catch (error) {
        console.error("Error removing channel:", error);
      }
      channelRef.current = null;
    }
  }, [options.table]);

  // Reconnect with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (stats.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnection attempts reached for ${options.table}`);
      setStats(prev => ({
        ...prev,
        lastError: "Max reconnection attempts reached",
      }));
      return;
    }

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, stats.reconnectAttempts);
    console.log(`🔄 Scheduling reconnection in ${delay}ms for ${options.table}`);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isUnmountedRef.current) return;
      
      setStats(prev => ({
        ...prev,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));

      // The subscription will be recreated by the useEffect
    }, delay);
  }, [options.table, stats.reconnectAttempts]);

  // Subscribe to realtime changes
  useEffect(() => {
    // Skip if disabled
    if (options.enabled === false) {
      console.log(`⏸️ Realtime subscription disabled for ${options.table}`);
      return;
    }

    // Skip if too many errors
    if (stats.errorCount >= MAX_ERROR_COUNT) {
      console.error(`❌ Too many errors for ${options.table}, stopping subscription`);
      return;
    }

    isUnmountedRef.current = false;

    // Generate unique channel name with timestamp to prevent conflicts
    const channelName = `safe-realtime-${options.table}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    console.log(`📡 Creating realtime subscription for ${options.table}`);

    try {
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as any,
          {
            event: options.event || "*",
            schema: "public",
            table: options.table,
            filter: options.filter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            // Check if component is still mounted
            if (isUnmountedRef.current) return;

            try {
              console.log(`📨 Realtime event on ${options.table}:`, payload.eventType);

              // Use stable callback refs to prevent memory leaks
              const callbacks = callbacksRef.current;

              switch (payload.eventType) {
                case "INSERT":
                  callbacks.onInsert?.(payload);
                  break;
                case "UPDATE":
                  callbacks.onUpdate?.(payload);
                  break;
                case "DELETE":
                  callbacks.onDelete?.(payload);
                  break;
                default:
                  callbacks.onAny?.(payload);
              }
            } catch (error) {
              console.error(`Error in realtime callback for ${options.table}:`, error);
              setStats(prev => ({
                ...prev,
                errorCount: prev.errorCount + 1,
                lastError: (error as Error).message,
              }));
            }
          }
        )
        .subscribe((status) => {
          if (isUnmountedRef.current) return;

          console.log(`📡 Realtime status for ${options.table}:`, status);

          setStats(prev => ({
            ...prev,
            subscriptionStatus: status,
            isConnected: status === "SUBSCRIBED",
          }));

          if (status === "SUBSCRIBED") {
            console.log(`✅ Successfully subscribed to ${options.table}`);
            // Reset reconnection attempts on successful connection
            setStats(prev => ({
              ...prev,
              reconnectAttempts: 0,
              errorCount: Math.max(0, prev.errorCount - 1), // Decrease error count on success
            }));
          } else if (status === "CHANNEL_ERROR") {
            console.error(`❌ Channel error for ${options.table}`);
            setStats(prev => ({
              ...prev,
              errorCount: prev.errorCount + 1,
              lastError: "Channel error",
            }));
            scheduleReconnect();
          } else if (status === "TIMED_OUT") {
            console.warn(`⏰ Subscription timed out for ${options.table}`);
            setStats(prev => ({
              ...prev,
              lastError: "Subscription timed out",
            }));
            scheduleReconnect();
          } else if (status === "CLOSED") {
            console.log(`🔒 Subscription closed for ${options.table}`);
          }
        });

      channelRef.current = channel;
    } catch (error) {
      console.error(`Error creating subscription for ${options.table}:`, error);
      setStats(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1,
        lastError: (error as Error).message,
      }));
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      isUnmountedRef.current = true;
      cleanup();
    };
  }, [
    options.table,
    options.event,
    options.filter,
    options.enabled,
    stats.errorCount,
    stats.reconnectAttempts,
    cleanup,
    scheduleReconnect,
  ]);

  return {
    channel: channelRef.current,
    stats,
    isConnected: stats.isConnected,
  };
}

/**
 * Specialized hook for game updates
 */
export function useGameUpdatesSafe(
  gameId: string,
  onUpdate: (game: any) => void,
  enabled: boolean = true
) {
  const handleUpdate = useCallback(
    (payload: any) => {
      if (payload?.new) {
        onUpdate(payload.new);
      }
    },
    [onUpdate]
  );

  return useRealtimeSafe({
    table: "games",
    event: "UPDATE",
    filter: `id=eq.${gameId}`,
    onUpdate: handleUpdate,
    enabled,
  });
}

/**
 * Specialized hook for participant updates
 */
export function useParticipantUpdatesSafe(
  gameId: string,
  onInsert: (participant: any) => void,
  onUpdate: (participant: any) => void,
  onDelete: (participant: any) => void,
  enabled: boolean = true
) {
  const handleInsert = useCallback(
    (payload: any) => {
      if (payload?.new) onInsert(payload.new);
    },
    [onInsert]
  );

  const handleUpdate = useCallback(
    (payload: any) => {
      if (payload?.new) onUpdate(payload.new);
    },
    [onUpdate]
  );

  const handleDelete = useCallback(
    (payload: any) => {
      if (payload?.old) onDelete(payload.old);
    },
    [onDelete]
  );

  return useRealtimeSafe({
    table: "participants",
    event: "*",
    filter: `game_id=eq.${gameId}`,
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
    enabled,
  });
}

/**
 * Specialized hook for team score updates
 */
export function useTeamScoreUpdatesSafe(
  gameId: string,
  onUpdate: (team: any) => void,
  enabled: boolean = true
) {
  const handleUpdate = useCallback(
    (payload: any) => {
      if (payload?.new) {
        onUpdate(payload.new);
      }
    },
    [onUpdate]
  );

  return useRealtimeSafe({
    table: "teams",
    event: "UPDATE",
    filter: `game_id=eq.${gameId}`,
    onUpdate: handleUpdate,
    enabled,
  });
}

/**
 * Hook to manage multiple subscriptions efficiently
 */
export function useMultipleSubscriptions(subscriptions: RealtimeSubscriptionOptions[]) {
  const results = subscriptions.map(sub => useRealtimeSafe(sub));
  
  const allConnected = results.every(r => r.isConnected);
  const hasErrors = results.some(r => r.stats.errorCount > 0);
  const totalErrorCount = results.reduce((sum, r) => sum + r.stats.errorCount, 0);

  return {
    subscriptions: results,
    allConnected,
    hasErrors,
    totalErrorCount,
  };
}
