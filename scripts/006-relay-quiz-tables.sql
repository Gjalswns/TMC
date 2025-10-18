-- Relay Quiz Game specific tables

-- Create relay_quiz_questions table to store relay quiz questions
CREATE TABLE IF NOT EXISTS relay_quiz_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    question_order INTEGER NOT NULL, -- Order within the round (1, 2, 3, 4...)
    question_text TEXT NOT NULL,
    correct_answer TEXT NOT NULL, -- This answer becomes the number for the next question
    points INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create relay_quiz_sessions table to track each relay quiz game session
CREATE TABLE IF NOT EXISTS relay_quiz_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    time_limit_seconds INTEGER DEFAULT 300, -- 5 minutes default
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create relay_quiz_attempts table to track individual participant attempts
CREATE TABLE IF NOT EXISTS relay_quiz_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES relay_quiz_sessions(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    question_id UUID REFERENCES relay_quiz_questions(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    previous_answer TEXT, -- The answer from the previous question (used in current question)
    points_earned INTEGER DEFAULT 0,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create relay_quiz_team_progress table to track team progress through questions
CREATE TABLE IF NOT EXISTS relay_quiz_team_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES relay_quiz_sessions(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    current_question_order INTEGER DEFAULT 1, -- Which question the team is currently on
    total_questions INTEGER NOT NULL, -- Total questions in this round
    questions_completed INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    last_participant_id UUID REFERENCES participants(id), -- Who submitted the last answer
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_relay_quiz_questions_game ON relay_quiz_questions(game_id);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_questions_round ON relay_quiz_questions(round_number);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_questions_order ON relay_quiz_questions(question_order);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_sessions_game ON relay_quiz_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_sessions_round ON relay_quiz_sessions(round_number);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_session ON relay_quiz_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_team ON relay_quiz_attempts(team_id);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_participant ON relay_quiz_attempts(participant_id);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_team_progress_session ON relay_quiz_team_progress(session_id);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_team_progress_team ON relay_quiz_team_progress(team_id);

-- Enable Row Level Security
ALTER TABLE relay_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_quiz_team_progress ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing all operations for now - adjust based on your auth requirements)
DROP POLICY IF EXISTS "Allow all operations on relay_quiz_questions" ON relay_quiz_questions;
CREATE POLICY "Allow all operations on relay_quiz_questions" ON relay_quiz_questions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on relay_quiz_sessions" ON relay_quiz_sessions;
CREATE POLICY "Allow all operations on relay_quiz_sessions" ON relay_quiz_sessions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on relay_quiz_attempts" ON relay_quiz_attempts;
CREATE POLICY "Allow all operations on relay_quiz_attempts" ON relay_quiz_attempts FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on relay_quiz_team_progress" ON relay_quiz_team_progress;
CREATE POLICY "Allow all operations on relay_quiz_team_progress" ON relay_quiz_team_progress FOR ALL USING (true);
