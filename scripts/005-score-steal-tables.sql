-- Score Steal Game specific tables

-- Create score_steal_questions table to store questions for the score steal game
CREATE TABLE IF NOT EXISTS score_steal_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    points INTEGER NOT NULL CHECK (points IN (10, 20, 30)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create score_steal_sessions table to track each score steal game session
CREATE TABLE IF NOT EXISTS score_steal_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create score_steal_attempts table to track team attempts
CREATE TABLE IF NOT EXISTS score_steal_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    question_id UUID REFERENCES score_steal_questions(id) ON DELETE CASCADE,
    target_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    points_gained INTEGER DEFAULT 0, -- Points gained by attacking team
    points_lost INTEGER DEFAULT 0,   -- Points lost by target team
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_score_steal_questions_game ON score_steal_questions(game_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_questions_difficulty ON score_steal_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_game ON score_steal_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_round ON score_steal_sessions(round_number);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_game ON score_steal_attempts(game_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_team ON score_steal_attempts(team_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_target ON score_steal_attempts(target_team_id);

-- Enable Row Level Security
ALTER TABLE score_steal_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_steal_attempts ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing all operations for now - adjust based on your auth requirements)
DROP POLICY IF EXISTS "Allow all operations on score_steal_questions" ON score_steal_questions;
CREATE POLICY "Allow all operations on score_steal_questions" ON score_steal_questions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on score_steal_sessions" ON score_steal_sessions;
CREATE POLICY "Allow all operations on score_steal_sessions" ON score_steal_sessions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on score_steal_attempts" ON score_steal_attempts;
CREATE POLICY "Allow all operations on score_steal_attempts" ON score_steal_attempts FOR ALL USING (true);
