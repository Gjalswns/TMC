// This file is for backward compatibility
// All new code should import from @/lib/supabase instead
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";

export function createClient() {
  return supabase;
}

// Re-export for convenience
export { supabase, Database };
