import { createClient } from "@supabase/supabase-js";
import { Database } from "./supabase"; // Import the Database type from the existing supabase file

// Ensure the environment variables are not empty
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Check if environment variables are properly configured
if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}

if (!supabaseServiceRoleKey && !supabaseAnonKey) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable"
  );
}

// Create a mock client if environment variables are missing (for development)
const createMockServerClient = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Supabase not configured" },
          }),
      }),
    }),
    insert: () =>
      Promise.resolve({
        data: null,
        error: { message: "Supabase not configured" },
      }),
    update: () =>
      Promise.resolve({
        data: null,
        error: { message: "Supabase not configured" },
      }),
    delete: () =>
      Promise.resolve({
        data: null,
        error: { message: "Supabase not configured" },
      }),
    eq: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      single: () =>
        Promise.resolve({
          data: null,
          error: { message: "Supabase not configured" },
        }),
    }),
    order: () => Promise.resolve({ data: [], error: null }),
    single: () =>
      Promise.resolve({
        data: null,
        error: { message: "Supabase not configured" },
      }),
  }),
  channel: () => ({
    on: () => ({
      on: () => ({ subscribe: () => {}, removeChannel: () => {} }),
    }),
    subscribe: () => {},
  }),
  removeChannel: () => {},
});

// Create and export the Supabase client for server-side use
export const supabaseServer =
  supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
    ? createClient<Database>(
        supabaseUrl,
        supabaseServiceRoleKey || supabaseAnonKey
      )
    : (createMockServerClient() as any);
