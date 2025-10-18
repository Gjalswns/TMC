import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
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
}

export function useRealtime(options: RealtimeSubscriptionOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channelName = `realtime-${options.table}-${Date.now()}`;

    channelRef.current = supabase
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
          console.log(`Realtime event on ${options.table}:`, payload);

          switch (payload.eventType) {
            case "INSERT":
              options.onInsert?.(payload);
              break;
            case "UPDATE":
              options.onUpdate?.(payload);
              break;
            case "DELETE":
              options.onDelete?.(payload);
              break;
            default:
              options.onAny?.(payload);
          }
        }
      )
      .subscribe((status) => {
        console.log(
          `Realtime subscription status for ${options.table}:`,
          status
        );

        if (status === "SUBSCRIBED") {
          console.log(`✅ Successfully subscribed to ${options.table} table`);
        } else if (status === "CHANNEL_ERROR") {
          console.error(`❌ Failed to subscribe to ${options.table} table`);
        } else if (status === "TIMED_OUT") {
          console.warn(`⏰ Subscription to ${options.table} table timed out`);
        } else if (status === "CLOSED") {
          console.log(`🔒 Subscription to ${options.table} table closed`);
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [
    options.table,
    options.event,
    options.filter,
    options.onInsert,
    options.onUpdate,
    options.onDelete,
    options.onAny,
  ]);

  return channelRef.current;
}

// 특화된 훅들
export function useGameUpdates(gameId: string, onUpdate: (game: any) => void) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );

  return useRealtime({
    table: "games",
    event: "UPDATE",
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
    (payload: any) => onInsert(payload.new),
    [onInsert]
  );
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );
  const handleDelete = useCallback(
    (payload: any) => onDelete(payload.old),
    [onDelete]
  );

  return useRealtime({
    table: "participants",
    event: "*",
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
    (payload: any) => onInsert(payload.new),
    [onInsert]
  );
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );
  const handleDelete = useCallback(
    (payload: any) => onDelete(payload.old),
    [onDelete]
  );

  return useRealtime({
    table: "teams",
    event: "*",
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
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );

  return useRealtime({
    table: "year_game_sessions",
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

// Score Steal Game specific hooks
export function useScoreStealSessionUpdates(
  gameId: string,
  onUpdate: (session: any) => void
) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );

  return useRealtime({
    table: "score_steal_sessions",
    event: "UPDATE",
    filter: `game_id=eq.${gameId}`,
    onUpdate: handleUpdate,
  });
}

export function useScoreStealAttemptsUpdates(
  gameId: string,
  roundNumber: number,
  onInsert: (attempt: any) => void
) {
  const handleInsert = useCallback(
    (payload: any) => onInsert(payload.new),
    [onInsert]
  );

  return useRealtime({
    table: "score_steal_attempts",
    event: "INSERT",
    filter: `game_id=eq.${gameId} and round_number=eq.${roundNumber}`,
    onInsert: handleInsert,
  });
}

// Relay Quiz Game specific hooks
export function useRelayQuizSessionUpdates(
  gameId: string,
  onUpdate: (session: any) => void
) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );

  return useRealtime({
    table: "relay_quiz_sessions",
    event: "UPDATE",
    filter: `game_id=eq.${gameId}`,
    onUpdate: handleUpdate,
  });
}

export function useRelayQuizTeamProgressUpdates(
  sessionId: string,
  onUpdate: (progress: any) => void
) {
  const handleUpdate = useCallback(
    (payload: any) => onUpdate(payload.new),
    [onUpdate]
  );

  return useRealtime({
    table: "relay_quiz_team_progress",
    event: "UPDATE",
    filter: `session_id=eq.${sessionId}`,
    onUpdate: handleUpdate,
  });
}

export function useRelayQuizAttemptsUpdates(
  sessionId: string,
  onInsert: (attempt: any) => void
) {
  const handleInsert = useCallback(
    (payload: any) => onInsert(payload.new),
    [onInsert]
  );

  return useRealtime({
    table: "relay_quiz_attempts",
    event: "INSERT",
    filter: `session_id=eq.${sessionId}`,
    onInsert: handleInsert,
  });
}
