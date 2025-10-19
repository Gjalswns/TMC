import { RealtimeChannel, RealtimePostgresChangesPayload, RealtimePostgresChangesFilter } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Type definitions for database tables
type Database = {
  public: {
    Tables: {
      games: {
        Row: { [key: string]: any };
        Insert: { [key: string]: any };
        Update: { [key: string]: any };
      };
      participants: {
        Row: { [key: string]: any };
        Insert: { [key: string]: any };
        Update: { [key: string]: any };
      };
      year_game_sessions: {
        Row: { [key: string]: any };
        Insert: { [key: string]: any };
        Update: { [key: string]: any };
      };
      teams: {
        Row: { [key: string]: any };
        Insert: { [key: string]: any };
        Update: { [key: string]: any };
      };
      [key: string]: any;
    };
  };
};

type TableName = keyof Database['public']['Tables'];
type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
type ChangePayload<T extends TableName> = RealtimePostgresChangesPayload<TableRow<T>>;

interface RealtimeOptions<T extends TableName> {
  table: T;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onInsert?: (payload: ChangePayload<T>) => void;
  onUpdate?: (payload: ChangePayload<T>) => void;
  onDelete?: (payload: ChangePayload<T>) => void;
  onError?: (error: Error) => void;
}

export function createRealtimeSubscription<T extends TableName>(options: RealtimeOptions<T>) {
  let channel: RealtimeChannel | null = null;
  let isConnected = false;
  let retryCount = 0;
  const maxRetries = 5;
  const retryDelay = 2000;
  
  const handleStateChange = (status: string) => {
    console.log(`Connection status for ${options.table}:`, status);
    isConnected = status === 'SUBSCRIBED';
    
    if (status === 'CHANNEL_ERROR' && retryCount < maxRetries) {
      retryCount++;
      console.log(`Reconnecting... (attempt ${retryCount}/${maxRetries})`);
      setTimeout(connect, retryDelay * retryCount);
    }
  };
  
  const handleError = (error: Error) => {
    console.error(`Realtime error on ${options.table}:`, error);
    options.onError?.(error);
    
    if (retryCount < maxRetries) {
      retryCount++;
      console.log(`Reconnecting after error... (attempt ${retryCount}/${maxRetries})`);
      setTimeout(connect, retryDelay * retryCount);
    }
  };
  
  const connect = async () => {
    if (!supabase) {
      handleError(new Error('Supabase client is not initialized'));
      return;
    }
    
    try {
      // Clean up existing channel if it exists
      if (channel) {
        await channel.unsubscribe();
        channel = null;
      }
      
      // Create new channel with a unique name
      const channelName = `realtime-${String(options.table)}-${Date.now()}`;
      channel = supabase.channel(channelName);
      
      // Set up the subscription
      const subscription = channel
        .on('postgres_changes' as any, {
          event: options.event || '*',
          schema: 'public',
          table: options.table,
          filter: options.filter,
        } as RealtimePostgresChangesFilter<'*'>, 
        (payload: any) => {
          if (payload.eventType === 'INSERT' && options.onInsert) {
            options.onInsert(payload);
          } else if (payload.eventType === 'UPDATE' && options.onUpdate) {
            options.onUpdate(payload);
          } else if (payload.eventType === 'DELETE' && options.onDelete) {
            options.onDelete(payload);
          }
        })
        .subscribe((status: string, err?: Error) => {
          handleStateChange(status);
          if (err) handleError(err);
        });
      
      return subscription;
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
    }
  };
  
  const disconnect = async () => {
    if (channel) {
      try {
        await channel.unsubscribe();
      } catch (error) {
        console.error('Error unsubscribing from channel:', error);
      } finally {
        channel = null;
        isConnected = false;
      }
    }
  };
  
  // Initialize connection
  connect();
  
  // Return cleanup function and connection status
  return {
    disconnect,
    get isConnected() {
      return isConnected;
    },
    reconnect: connect,
  };
}

// Helper functions for common use cases
export function subscribeToTable<T extends TableName>(
  table: T,
  callbacks: {
    onInsert?: (payload: ChangePayload<T>) => void;
    onUpdate?: (payload: ChangePayload<T>) => void;
    onDelete?: (payload: ChangePayload<T>) => void;
    onError?: (error: Error) => void;
  }
) {
  return createRealtimeSubscription({
    table,
    event: '*',
    ...callbacks,
  });
}

export function subscribeToInserts<T extends TableName>(
  table: T,
  onInsert: (payload: ChangePayload<T>) => void,
  onError?: (error: Error) => void
) {
  return createRealtimeSubscription({
    table,
    event: 'INSERT',
    onInsert,
    onError,
  });
}

export function subscribeToUpdates<T extends TableName>(
  table: T,
  filter: string,
  onUpdate: (payload: ChangePayload<T>) => void,
  onError?: (error: Error) => void
) {
  return createRealtimeSubscription({
    table,
    event: 'UPDATE',
    filter,
    onUpdate,
    onError,
  });
}

export function subscribeToDeletes<T extends TableName>(
  table: T,
  onDelete: (payload: ChangePayload<T>) => void,
  onError?: (error: Error) => void
) {
  return createRealtimeSubscription({
    table,
    event: 'DELETE',
    onDelete,
    onError,
  });
}
