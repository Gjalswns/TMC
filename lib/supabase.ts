import { createClient } from "@supabase/supabase-js"

// Get environment variables with fallbacks for development
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Check if environment variables are properly configured
if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable")
}

// Create a mock client if environment variables are missing (for development)
const createMockClient = () => ({
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
    update: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
    delete: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
    eq: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
    }),
    order: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
  }),
  channel: () => ({
    on: () => ({ on: () => ({ subscribe: () => {}, removeChannel: () => {} }) }),
    subscribe: () => {},
  }),
  removeChannel: () => {},
})

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : (createMockClient() as any)

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          title: string
          grade_class: string
          duration: number
          team_count: number
          game_code: string
          status: "waiting" | "started" | "finished"
          current_round: 1 | 2 | 3
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          grade_class: string
          duration: number
          team_count: number
          game_code: string
          status?: "waiting" | "started" | "finished"
          current_round?: 1 | 2 | 3
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          grade_class?: string
          duration?: number
          team_count?: number
          game_code?: string
          status?: "waiting" | "started" | "finished"
          current_round?: 1 | 2 | 3
          created_at?: string
          updated_at?: string
        }
      }
      teams: {
        Row: {
          id: string
          game_id: string
          team_name: string
          team_number: number
          score: number
          created_at: string
        }
        Insert: {
          id?: string
          game_id: string
          team_name: string
          team_number: number
          score?: number
          created_at?: string
        }
        Update: {
          id?: string
          game_id?: string
          team_name?: string
          team_number?: number
          score?: number
          created_at?: string
        }
      }
      participants: {
        Row: {
          id: string
          game_id: string
          team_id: string | null
          nickname: string
          student_id: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          game_id: string
          team_id?: string | null
          nickname: string
          student_id?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          game_id?: string
          team_id?: string | null
          nickname?: string
          student_id?: string | null
          joined_at?: string
        }
      }
    }
  }
}
