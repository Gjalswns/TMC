-- Year Game specific tables

-- Create year_game_sessions table to track each game session
CREATE TABLE IF NOT EXISTS year_game_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    target_numbers INTEGER[] NOT NULL, -- Array of 4 numbers (0-9)
    time_limit_seconds INTEGER DEFAULT 180, -- 3 minutes default
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create year_game_attempts table to track team attempts
CREATE TABLE IF NOT EXISTS year_game_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES year_game_sessions(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    expression TEXT NOT NULL, -- The mathematical expression
    target_number INTEGER NOT NULL, -- The number they were trying to make
    is_valid BOOLEAN NOT NULL, -- Whether the expression is mathematically valid
    is_correct BOOLEAN NOT NULL, -- Whether it equals the target number
    is_duplicate BOOLEAN DEFAULT FALSE, -- Whether this number was already found
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create year_game_results table to track final results per team
CREATE TABLE IF NOT EXISTS year_game_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES year_game_sessions(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    numbers_found INTEGER[] DEFAULT '{}', -- Array of numbers successfully found
    total_found INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0, -- Points based on numbers found
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add game_type column to games table to distinguish different game types
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type VARCHAR(50) DEFAULT 'general';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_year_game_sessions_game ON year_game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_year_game_attempts_session ON year_game_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_year_game_attempts_team ON year_game_attempts(team_id);
CREATE INDEX IF NOT EXISTS idx_year_game_results_session ON year_game_results(session_id);
CREATE INDEX IF NOT EXISTS idx_year_game_results_team ON year_game_results(team_id);

-- Enable Row Level Security
ALTER TABLE year_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_results ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing all operations for now - adjust based on your auth requirements)
DROP POLICY IF EXISTS "Allow all operations on year_game_sessions" ON year_game_sessions;
CREATE POLICY "Allow all operations on year_game_sessions" ON year_game_sessions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on year_game_attempts" ON year_game_attempts;
CREATE POLICY "Allow all operations on year_game_attempts" ON year_game_attempts FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on year_game_results" ON year_game_results;
CREATE POLICY "Allow all operations on year_game_results" ON year_game_results FOR ALL USING (true);
