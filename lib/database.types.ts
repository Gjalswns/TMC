// TMC Database Types - Updated for new schema
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
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
          status: 'waiting' | 'started' | 'finished'
          current_round: number
          created_at: string
          updated_at: string
          round1_timeout_seconds: number | null
          total_rounds: number | null
          game_type: string | null
          max_participants: number | null
          game_expires_at: string | null
          join_deadline_minutes: number | null
          version: number | null
          uses_brackets: boolean | null
        }
        Insert: {
          id?: string
          title: string
          grade_class: string
          duration: number
          team_count: number
          game_code: string
          status?: 'waiting' | 'started' | 'finished'
          current_round?: number
          created_at?: string
          updated_at?: string
          round1_timeout_seconds?: number | null
          total_rounds?: number | null
          game_type?: string | null
          max_participants?: number | null
          game_expires_at?: string | null
          join_deadline_minutes?: number | null
          version?: number | null
          uses_brackets?: boolean | null
        }
        Update: {
          id?: string
          title?: string
          grade_class?: string
          duration?: number
          team_count?: number
          game_code?: string
          status?: 'waiting' | 'started' | 'finished'
          current_round?: number
          created_at?: string
          updated_at?: string
          round1_timeout_seconds?: number | null
          total_rounds?: number | null
          game_type?: string | null
          max_participants?: number | null
          game_expires_at?: string | null
          join_deadline_minutes?: number | null
          version?: number | null
          uses_brackets?: boolean | null
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
          bracket: 'higher' | 'lower' | null
        }
        Insert: {
          id?: string
          game_id: string
          team_name: string
          team_number: number
          score?: number
          created_at?: string
          bracket?: 'higher' | 'lower' | null
        }
        Update: {
          id?: string
          game_id?: string
          team_name?: string
          team_number?: number
          score?: number
          created_at?: string
          bracket?: 'higher' | 'lower' | null
        }
      }
      participants: {
        Row: {
          id: string
          game_id: string
          team_id: string | null
          nickname: string
          user_identifier: string | null
          student_id: string | null
          joined_at: string
          preregistered_player_id: string | null
        }
        Insert: {
          id?: string
          game_id: string
          team_id?: string | null
          nickname: string
          user_identifier?: string | null
          student_id?: string | null
          joined_at?: string
          preregistered_player_id?: string | null
        }
        Update: {
          id?: string
          game_id?: string
          team_id?: string | null
          nickname?: string
          user_identifier?: string | null
          student_id?: string | null
          joined_at?: string
          preregistered_player_id?: string | null
        }
      }
      preregistered_players: {
        Row: {
          id: string
          player_name: string
          player_number: number | null
          team_name: string
          bracket: 'higher' | 'lower'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_name: string
          player_number?: number | null
          team_name: string
          bracket: 'higher' | 'lower'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_name?: string
          player_number?: number | null
          team_name?: string
          bracket?: 'higher' | 'lower'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      year_game_sessions: {
        Row: {
          id: string
          game_id: string
          round_number: number
          target_numbers: number[]
          time_limit_seconds: number
          status: 'waiting' | 'active' | 'finished'
          started_at: string | null
          ended_at: string | null
          created_at: string
          target_range_start: number | null
          target_range_end: number | null
        }
        Insert: {
          id?: string
          game_id: string
          round_number: number
          target_numbers: number[]
          time_limit_seconds?: number
          status?: 'waiting' | 'active' | 'finished'
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          target_range_start?: number | null
          target_range_end?: number | null
        }
        Update: {
          id?: string
          game_id?: string
          round_number?: number
          target_numbers?: number[]
          time_limit_seconds?: number
          status?: 'waiting' | 'active' | 'finished'
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          target_range_start?: number | null
          target_range_end?: number | null
        }
      }
      year_game_results: {
        Row: {
          id: string
          session_id: string
          team_id: string
          numbers_found: number[]
          total_found: number
          score: number
          created_at: string
          updated_at: string
          numbers_found_count: number | null
          completion_percentage: number | null
        }
        Insert: {
          id?: string
          session_id: string
          team_id: string
          numbers_found?: number[]
          total_found?: number
          score?: number
          created_at?: string
          updated_at?: string
          numbers_found_count?: number | null
          completion_percentage?: number | null
        }
        Update: {
          id?: string
          session_id?: string
          team_id?: string
          numbers_found?: number[]
          total_found?: number
          score?: number
          created_at?: string
          updated_at?: string
          numbers_found_count?: number | null
          completion_percentage?: number | null
        }
      }
      score_steal_sessions: {
        Row: {
          id: string
          game_id: string
          round_number: number
          status: 'waiting' | 'active' | 'finished'
          started_at: string | null
          ended_at: string | null
          created_at: string
          current_question_id: string | null
          question_broadcast_at: string | null
          winner_team_id: string | null
          phase: string | null
          input_locked: boolean | null
          winner_response_time_ms: number | null
          last_winner_team_id: string | null
          higher_bracket_locked: boolean | null
          lower_bracket_locked: boolean | null
          higher_bracket_winner_team_id: string | null
          lower_bracket_winner_team_id: string | null
          steal_targets_selected: boolean | null
        }
        Insert: {
          id?: string
          game_id: string
          round_number: number
          status?: 'waiting' | 'active' | 'finished'
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          current_question_id?: string | null
          question_broadcast_at?: string | null
          winner_team_id?: string | null
          phase?: string | null
          input_locked?: boolean | null
          winner_response_time_ms?: number | null
          last_winner_team_id?: string | null
          higher_bracket_locked?: boolean | null
          lower_bracket_locked?: boolean | null
          higher_bracket_winner_team_id?: string | null
          lower_bracket_winner_team_id?: string | null
          steal_targets_selected?: boolean | null
        }
        Update: {
          id?: string
          game_id?: string
          round_number?: number
          status?: 'waiting' | 'active' | 'finished'
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          current_question_id?: string | null
          question_broadcast_at?: string | null
          winner_team_id?: string | null
          phase?: string | null
          input_locked?: boolean | null
          winner_response_time_ms?: number | null
          last_winner_team_id?: string | null
          higher_bracket_locked?: boolean | null
          lower_bracket_locked?: boolean | null
          higher_bracket_winner_team_id?: string | null
          lower_bracket_winner_team_id?: string | null
          steal_targets_selected?: boolean | null
        }
      }
      score_steal_questions: {
        Row: {
          id: string
          question_text: string
          correct_answer: string
          difficulty: 'easy' | 'medium' | 'hard'
          points: number
          created_at: string
        }
        Insert: {
          id?: string
          question_text: string
          correct_answer: string
          difficulty: 'easy' | 'medium' | 'hard'
          points: number
          created_at?: string
        }
        Update: {
          id?: string
          question_text?: string
          correct_answer?: string
          difficulty?: 'easy' | 'medium' | 'hard'
          points?: number
          created_at?: string
        }
      }
      score_steal_attempts: {
        Row: {
          id: string
          session_id: string
          team_id: string
          participant_id: string
          question_id: string
          answer: string
          is_correct: boolean
          submitted_at: string
          bracket: string | null
        }
        Insert: {
          id?: string
          session_id: string
          team_id: string
          participant_id: string
          question_id: string
          answer: string
          is_correct: boolean
          submitted_at?: string
          bracket?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          team_id?: string
          participant_id?: string
          question_id?: string
          answer?: string
          is_correct?: boolean
          submitted_at?: string
          bracket?: string | null
        }
      }
      relay_quiz_hint_usage: {
        Row: {
          id: string
          session_id: string
          team_id: string
          participant_id: string
          cycle_number: number
          question_order: number
          revealed_answer: string
          penalty_points: number
          used_at: string
        }
        Insert: {
          id?: string
          session_id: string
          team_id: string
          participant_id: string
          cycle_number: number
          question_order: number
          revealed_answer: string
          penalty_points?: number
          used_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          team_id?: string
          participant_id?: string
          cycle_number?: number
          question_order?: number
          revealed_answer?: string
          penalty_points?: number
          used_at?: string
        }
      }
      score_steal_protection: {
        Row: {
          id: string
          session_id: string
          team_id: string
          question_id: string
          was_stolen_from: boolean
          protected_until_question: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          team_id: string
          question_id: string
          was_stolen_from?: boolean
          protected_until_question?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          team_id?: string
          question_id?: string
          was_stolen_from?: boolean
          protected_until_question?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      year_game_team_progress: {
        Row: {
          session_id: string
          team_id: string
          team_name: string
          team_number: number
          numbers_found: number[]
          total_found: number
          score: number
          numbers_found_count: number | null
          completion_percentage: number | null
          target_range_start: number | null
          target_range_end: number | null
          total_possible_numbers: number | null
          progress_percentage: number | null
          last_updated: string | null
        }
      }
      score_steal_current_state: {
        Row: {
          session_id: string
          game_id: string
          current_question_id: string | null
          status: string
          higher_bracket_locked: boolean | null
          lower_bracket_locked: boolean | null
          steal_targets_selected: boolean | null
          higher_winner_team_id: string | null
          higher_winner_team_name: string | null
          lower_winner_team_id: string | null
          lower_winner_team_name: string | null
          phase: string | null
        }
      }
    }
    Functions: {
      generate_two_digit_code: {
        Args: {}
        Returns: string
      }
      bulk_register_players: {
        Args: {
          p_players: Json
        }
        Returns: {
          success: boolean
          inserted_count: number
          message: string
        }[]
      }
      get_preregistered_teams: {
        Args: {}
        Returns: {
          team_name: string
          bracket: string
          player_count: number
          players: Json
        }[]
      }
      join_game_with_preregistered_player: {
        Args: {
          p_game_code: string
          p_player_id: string
        }
        Returns: {
          game_id: string | null
          team_id: string | null
          participant_id: string | null
          team_name: string | null
          player_name: string | null
          bracket: string | null
          success: boolean
          message: string
        }[]
      }
      submit_score_steal_attempt: {
        Args: {
          p_session_id: string
          p_team_id: string
          p_participant_id: string
          p_question_id: string
          p_answer: string
        }
        Returns: {
          attempt_id: string | null
          is_correct: boolean
          points_change: number
          bracket_locked: boolean
          waiting_for_other_bracket: boolean
          success: boolean
          message: string
        }[]
      }
      execute_score_steal: {
        Args: {
          p_session_id: string
          p_question_id: string
          p_higher_target_team_id: string
          p_lower_target_team_id: string
        }
        Returns: {
          success: boolean
          message: string
          steal_details: Json
        }[]
      }
      use_relay_quiz_hint: {
        Args: {
          p_session_id: string
          p_team_id: string
          p_participant_id: string
          p_question_order: number
        }
        Returns: {
          hint_id: string | null
          revealed_answer: string | null
          penalty_points: number
          new_total_score: number
          success: boolean
          message: string
        }[]
      }
      submit_relay_quiz_answer_with_hints: {
        Args: {
          p_session_id: string
          p_team_id: string
          p_participant_id: string
          p_answer: string
        }
        Returns: {
          attempt_id: string | null
          is_correct: boolean
          is_cycle_complete: boolean
          next_question_order: number
          available_hints: Json
          success: boolean
          message: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
      Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
      Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never