import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 환경 변수 가져오기
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 환경 변수 확인
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "⚠️ Supabase 환경 변수가 설정되지 않았습니다. ",
    "NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인해주세요."
  );
}

// 개발용 모의 클라이언트 생성
const createMockClient = (): SupabaseClient => {
  console.warn("⚠️ Supabase 모의 클라이언트가 사용 중입니다. 환경 변수를 설정해주세요.");
  
  const mockError = { 
    message: "Supabase가 제대로 설정되지 않았습니다. 환경 변수를 확인해주세요." 
  };
  
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
  } as unknown as SupabaseClient;
};

// 싱글톤 패턴을 사용한 Supabase 클라이언트 생성
let supabaseInstance: SupabaseClient | null = null;

/**
 * Supabase 클라이언트를 생성하거나 기존 인스턴스를 반환합니다.
 * 환경 변수가 설정되지 않은 경우 모의 클라이언트를 반환합니다.
 */
function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    supabaseInstance = createMockClient();
    return supabaseInstance;
  }

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'x-client-info': 'tmc-game@1.0.0',
      },
    },
  });

  return supabaseInstance;
}

// Supabase 클라이언트 내보내기
export const supabase = getSupabaseClient();

// 클라이언트 생성 함수도 export (컴포넌트에서 사용)
export { createClient } from "@supabase/supabase-js";

// Supabase가 제대로 설정되었는지 확인하는 헬퍼 함수
export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseAnonKey);
};

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          title: string;
          grade_class: string;
          duration: number;
          team_count: number;
          game_code: string;
          status: "waiting" | "started" | "finished";
          current_round: number;
          created_at: string;
          updated_at: string;
          round1_timeout_seconds?: number;
          total_rounds?: number;
          game_type?: string;
        };
        Insert: {
          id?: string;
          title: string;
          grade_class: string;
          duration: number;
          team_count: number;
          game_code: string;
          status?: "waiting" | "started" | "finished";
          current_round?: number;
          created_at?: string;
          updated_at?: string;
          round1_timeout_seconds?: number;
          total_rounds?: number;
          game_type?: string;
        };
        Update: {
          id?: string;
          title?: string;
          grade_class?: string;
          duration?: number;
          team_count?: number;
          game_code?: string;
          status?: "waiting" | "started" | "finished";
          current_round?: number;
          created_at?: string;
          updated_at?: string;
          round1_timeout_seconds?: number;
          total_rounds?: number;
          game_type?: string;
        };
      };
      teams: {
        Row: {
          id: string;
          game_id: string;
          team_name: string;
          team_number: number;
          score: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          team_name: string;
          team_number: number;
          score?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          team_name?: string;
          team_number?: number;
          score?: number;
          created_at?: string;
        };
      };
      participants: {
        Row: {
          id: string;
          game_id: string;
          team_id: string | null;
          nickname: string;
          student_id: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          team_id?: string | null;
          nickname: string;
          student_id?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          team_id?: string | null;
          nickname?: string;
          student_id?: string | null;
          joined_at?: string;
        };
      };
      year_game_sessions: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          target_numbers: number[];
          time_limit_seconds: number;
          status: "waiting" | "active" | "finished";
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          target_numbers: number[];
          time_limit_seconds?: number;
          status?: "waiting" | "active" | "finished";
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          round_number?: number;
          target_numbers?: number[];
          time_limit_seconds?: number;
          status?: "waiting" | "active" | "finished";
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
      };
      year_game_attempts: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          participant_id: string;
          expression: string;
          target_number: number;
          is_valid: boolean;
          is_correct: boolean;
          is_duplicate: boolean;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          participant_id: string;
          expression: string;
          target_number: number;
          is_valid: boolean;
          is_correct: boolean;
          is_duplicate?: boolean;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          participant_id?: string;
          expression?: string;
          target_number?: number;
          is_valid?: boolean;
          is_correct?: boolean;
          is_duplicate?: boolean;
          submitted_at?: string;
        };
      };
      year_game_results: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          numbers_found: number[];
          total_found: number;
          score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          numbers_found?: number[];
          total_found?: number;
          score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          numbers_found?: number[];
          total_found?: number;
          score?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      score_steal_questions: {
        Row: {
          id: string;
          game_id: string;
          question_text: string;
          correct_answer: string;
          difficulty: "easy" | "medium" | "hard";
          points: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          question_text: string;
          correct_answer: string;
          difficulty: "easy" | "medium" | "hard";
          points: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          question_text?: string;
          correct_answer?: string;
          difficulty?: "easy" | "medium" | "hard";
          points?: number;
          created_at?: string;
        };
      };
      score_steal_sessions: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          status: "waiting" | "active" | "finished";
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          status?: "waiting" | "active" | "finished";
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          round_number?: number;
          status?: "waiting" | "active" | "finished";
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
      };
      score_steal_attempts: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          team_id: string;
          question_id: string;
          target_team_id: string;
          answer: string;
          is_correct: boolean;
          points_gained: number;
          points_lost: number;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          team_id: string;
          question_id: string;
          target_team_id: string;
          answer: string;
          is_correct: boolean;
          points_gained?: number;
          points_lost?: number;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          round_number?: number;
          team_id?: string;
          question_id?: string;
          target_team_id?: string;
          answer?: string;
          is_correct?: boolean;
          points_gained?: number;
          points_lost?: number;
          submitted_at?: string;
        };
      };
      relay_quiz_questions: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          question_order: number;
          question_text: string;
          correct_answer: string;
          points: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          question_order: number;
          question_text: string;
          correct_answer: string;
          points?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          round_number?: number;
          question_order?: number;
          question_text?: string;
          correct_answer?: string;
          points?: number;
          created_at?: string;
        };
      };
      relay_quiz_sessions: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          status: "waiting" | "active" | "finished";
          time_limit_seconds: number;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          status?: "waiting" | "active" | "finished";
          time_limit_seconds?: number;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          round_number?: number;
          status?: "waiting" | "active" | "finished";
          time_limit_seconds?: number;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
      };
      relay_quiz_attempts: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          participant_id: string;
          question_id: string;
          answer: string;
          is_correct: boolean;
          previous_answer: string | null;
          points_earned: number;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          participant_id: string;
          question_id: string;
          answer: string;
          is_correct: boolean;
          previous_answer?: string | null;
          points_earned?: number;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          participant_id?: string;
          question_id?: string;
          answer?: string;
          is_correct?: boolean;
          previous_answer?: string | null;
          points_earned?: number;
          submitted_at?: string;
        };
      };
      relay_quiz_team_progress: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          current_question_order: number;
          total_questions: number;
          questions_completed: number;
          total_score: number;
          last_participant_id: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          current_question_order?: number;
          total_questions: number;
          questions_completed?: number;
          total_score?: number;
          last_participant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          current_question_order?: number;
          total_questions?: number;
          questions_completed?: number;
          total_score?: number;
          last_participant_id?: string | null;
          updated_at?: string;
        };
      };
    };
  };
};