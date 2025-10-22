-- Add time_limit_seconds to relay_quiz_questions for per-question time limits
-- Round 3 Relay Quiz: Q1=3min, Q2=4min, Q3=5min, Q4=5min

-- Add time_limit_seconds column to relay_quiz_questions
ALTER TABLE relay_quiz_questions 
ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER DEFAULT 300;

-- Add comment
COMMENT ON COLUMN relay_quiz_questions.time_limit_seconds IS 'Time limit in seconds for this specific question (Q1=180s, Q2=240s, Q3=300s, Q4=300s)';
