import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  createRealtimeSubscription,
  subscribeToTable,
  subscribeToInserts,
  subscribeToUpdates,
  subscribeToDeletes
} from '@/lib/realtime';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeSubscriptionOptions<T extends string> {
  table: T;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onError?: (error: Error) => void;
}

export function useRealtime<T extends string>({
  table,
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onError,
}: RealtimeSubscriptionOptions<T>) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const subscriptionRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  const handleError = useCallback((err: Error) => {
    console.error(`Realtime error on ${table}:`, err);
    setError(err);
    onError?.(err);
  }, [onError, table]);

  useEffect(() => {
    const setupSubscription = async () => {
      try {
        // Clean up existing subscription if it exists
        if (subscriptionRef.current) {
          await subscriptionRef.current.disconnect();
          subscriptionRef.current = null;
        }

        // Create new subscription with the appropriate handler based on the event type
        if (event === 'INSERT' && onInsert) {
          subscriptionRef.current = subscribeToInserts(
            table,
            (payload) => {
              console.log(`📡 Realtime INSERT on ${table}:`, payload);
              onInsert(payload);
            },
            handleError
          );
        } else if (event === 'UPDATE' && onUpdate) {
          if (!filter) {
            throw new Error('Filter is required for UPDATE events');
          }
          subscriptionRef.current = subscribeToUpdates(
            table,
            filter,
            (payload) => {
              console.log(`📡 Realtime UPDATE on ${table}:`, payload);
              onUpdate(payload);
            },
            handleError
          );
        } else if (event === 'DELETE' && onDelete) {
          subscriptionRef.current = subscribeToDeletes(
            table,
            (payload) => {
              console.log(`📡 Realtime DELETE on ${table}:`, payload);
              onDelete(payload);
            },
            handleError
          );
        } else {
          // Handle multiple event types or custom logic
          subscriptionRef.current = subscribeToTable(table, {
            onInsert: (payload) => {
              console.log(`📡 Realtime INSERT on ${table}:`, payload);
              onInsert?.(payload);
            },
            onUpdate: (payload) => {
              console.log(`📡 Realtime UPDATE on ${table}:`, payload);
              onUpdate?.(payload);
            },
            onDelete: (payload) => {
              console.log(`📡 Realtime DELETE on ${table}:`, payload);
              onDelete?.(payload);
            },
            onError: handleError,
          });
        }

        // Update connection status
        setIsConnected(true);
        console.log(`✅ Successfully subscribed to ${table} table`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        handleError(error);
      }
    };

    setupSubscription();

    // Cleanup function
    return () => {
      const cleanup = async () => {
        if (subscriptionRef.current) {
          try {
            await subscriptionRef.current.disconnect();
            console.log(`🔒 Unsubscribed from ${table} table`);
          } catch (err) {
            console.error(`Error unsubscribing from ${table}:`, err);
          } finally {
            subscriptionRef.current = null;
            setIsConnected(false);
          }
        }
      };
      cleanup();
    };
  }, [table, event, filter, onInsert, onUpdate, onDelete, handleError]);

  return { isConnected, error };
}

// Specialized hooks for common use cases
export function useGameUpdates(gameId: string, onUpdate: (game: any) => void) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new || payload),
    [onUpdate]
  );

  return useRealtime({
    table: 'games',
    event: 'UPDATE',
    filter: `id=eq.${gameId}`,
    onUpdate: handleUpdate,
  });
}

export function useParticipantUpdates(
  gameId: string,
  onInsert: (participant: any) => void,
  onUpdate: (participant: any) => void,
  onDelete: (participant: any) => void
) {
  const handleInsert = useCallback(
    (payload: any) => onInsert(payload.new || payload),
    [onInsert]
  );
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new || payload),
    [onUpdate]
  );
  const handleDelete = useCallback(
    (payload: any) => onDelete(payload.old || payload),
    [onDelete]
  );

  return useRealtime({
    table: 'participants',
    event: '*',
    filter: `game_id=eq.${gameId}`,
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  });
}

export function useTeamUpdates(
  gameId: string,
  onInsert: (team: any) => void,
  onUpdate: (team: any) => void,
  onDelete: (team: any) => void
) {
  const handleInsert = useCallback(
    (payload: any) => onInsert(payload.new || payload),
    [onInsert]
  );
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new || payload),
    [onUpdate]
  );
  const handleDelete = useCallback(
    (payload: any) => onDelete(payload.old || payload),
    [onDelete]
  );

  return useRealtime({
    table: 'teams',
    event: '*',
    filter: `game_id=eq.${gameId}`,
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  });
}

// Year Game specific hooks
export function useYearGameSessionUpdates(
  gameId: string,
  onUpdate: (session: any) => void
) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new || payload),
    [onUpdate]
  );

  return useRealtime({
    table: 'year_game_sessions',
    event: "UPDATE",
    filter: `game_id=eq.${gameId}`,
    onUpdate: handleUpdate,
  });
}

export function useYearGameResultsUpdates(
  sessionId: string,
  onUpdate: (result: any) => void
) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );

  return useRealtime({
    table: "year_game_results",
    event: "UPDATE",
    filter: `session_id=eq.${sessionId}`,
    onUpdate: handleUpdate,
  });
}

export function useYearGameAttemptsUpdates(
  sessionId: string,
  onInsert: (attempt: any) => void
) {
  const handleInsert = useCallback(
    (payload: any) => onInsert(payload.new),
    [onInsert]
  );

  return useRealtime({
    table: "year_game_attempts",
    event: "INSERT",
    filter: `session_id=eq.${sessionId}`,
    onInsert: handleInsert,
  });
}

// Removed: Score Steal and Relay Quiz hooks (games removed)