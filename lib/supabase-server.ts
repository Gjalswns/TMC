import { createClient } from "@supabase/supabase-js";
import { Database } from "./supabase"; // Import the Database type from the existing supabase file

// Ensure the environment variables are not empty
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Check if environment variables are properly configured
if (!supabaseUrl) {
  console.error("⚠️ Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}

if (!supabaseServiceRoleKey && !supabaseAnonKey) {
  console.error(
    "⚠️ Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable"
  );
}

// Create a mock client if environment variables are missing (for development)
const createMockServerClient = () => {
  const mockError = { message: "Supabase not configured. Please set environment variables." };
  
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: mockError }),
          order: () => Promise.resolve({ data: [], error: mockError }),
        }),
        order: () => Promise.resolve({ data: [], error: mockError }),
        single: () => Promise.resolve({ data: null, error: mockError }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: mockError }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: mockError }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: mockError }),
      }),
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: mockError }),
          order: () => Promise.resolve({ data: [], error: mockError }),
        }),
        single: () => Promise.resolve({ data: null, error: mockError }),
        update: () => Promise.resolve({ data: null, error: mockError }),
        delete: () => Promise.resolve({ data: null, error: mockError }),
      }),
      order: () => Promise.resolve({ data: [], error: mockError }),
      single: () => Promise.resolve({ data: null, error: mockError }),
    }),
    channel: () => ({
      on: () => ({
        on: () => ({
          on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
          subscribe: () => ({ unsubscribe: () => {} }),
        }),
        subscribe: () => ({ unsubscribe: () => {} }),
      }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    removeChannel: () => {},
    rpc: () => Promise.resolve({ data: null, error: mockError }),
  };
};

// Create and export the Supabase client for server-side use
export const supabaseServer =
  supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
    ? createClient<Database>(
        supabaseUrl,
        supabaseServiceRoleKey || supabaseAnonKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
          global: {
            headers: {
              'x-client-info': 'tmc-game-server@1.0.0',
            },
          },
        }
      )
    : (createMockServerClient() as any);

// Helper function to check if Supabase server is configured
export const isSupabaseServerConfigured = () => !!(supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey));
