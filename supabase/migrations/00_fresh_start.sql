-- ============================================================
-- TMC Game Platform - Fresh Database Schema
-- ============================================================
-- 깔끔하게 정리된 데이터베이스 스키마
-- 필요한 테이블과 기능만 포함
-- ============================================================

-- 기존 테이블 모두 삭제 (순서 중요 - 외래키 의존성 고려)
DROP TABLE IF EXISTS year_game_results CASCADE;
DROP TABLE IF EXISTS year_game_attempts CASCADE;
DROP TABLE IF EXISTS year_game_sessions CASCADE;

DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS preregistered_players CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS games CASCADE;

-- ============================================================
-- 1. 핵심 게임 테이블
-- ============================================================

-- 게임 테이블
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    grade_class VARCHAR(100) NOT NULL,
    duration INTEGER NOT NULL, -- 분 단위
    team_count INTEGER NOT NULL,
    join_code VARCHAR(10) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
    current_round INTEGER DEFAULT 1,
    uses_brackets BOOLEAN DEFAULT FALSE, -- Higher/Lower 브래킷 사용 여부
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 팀 테이블
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    team_number INTEGER NOT NULL,
    bracket VARCHAR(20) CHECK (bracket IN ('higher', 'lower')),
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사전 등록 선수 테이블
CREATE TABLE preregistered_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_name VARCHAR(100) NOT NULL,
    player_number INTEGER,
    team_name VARCHAR(100) NOT NULL,
    bracket VARCHAR(20) CHECK (bracket IN ('higher', 'lower')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 참가자 테이블
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    preregistered_player_id UUID REFERENCES preregistered_players(id),
    nickname VARCHAR(100) NOT NULL,
    user_identifier VARCHAR(100),
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Year Game (숫자 게임)
-- ============================================================

CREATE TABLE year_game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    target_numbers INTEGER[] NOT NULL, -- 4개 숫자 배열
    time_limit_seconds INTEGER DEFAULT 1200, -- 20분
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE year_game_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES year_game_sessions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    expression TEXT NOT NULL,
    target_number INTEGER NOT NULL,
    is_valid BOOLEAN NOT NULL,
    is_correct BOOLEAN NOT NULL,
    is_duplicate BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE year_game_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES year_game_sessions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    numbers_found INTEGER[] DEFAULT '{}',
    total_found INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, team_id)
);

-- ============================================================
-- 인덱스 생성
-- ============================================================

-- 게임 관련
CREATE INDEX idx_games_join_code ON games(join_code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_teams_game_id ON teams(game_id);
CREATE INDEX idx_teams_bracket ON teams(bracket);
CREATE INDEX idx_participants_game_id ON participants(game_id);
CREATE INDEX idx_participants_team_id ON participants(team_id);

-- 사전 등록 선수
CREATE INDEX idx_preregistered_players_team ON preregistered_players(team_name);
CREATE INDEX idx_preregistered_players_bracket ON preregistered_players(bracket);
CREATE INDEX idx_preregistered_players_active ON preregistered_players(is_active);

-- Year Game
CREATE INDEX idx_year_game_sessions_game ON year_game_sessions(game_id);
CREATE INDEX idx_year_game_attempts_session ON year_game_attempts(session_id);
CREATE INDEX idx_year_game_attempts_team ON year_game_attempts(team_id);
CREATE INDEX idx_year_game_results_session ON year_game_results(session_id);

-- ============================================================
-- Row Level Security (RLS) 활성화
-- ============================================================

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE preregistered_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_game_results ENABLE ROW LEVEL SECURITY;

-- 모든 작업 허용 정책 (프로토타입용)
CREATE POLICY "Allow all on games" ON games FOR ALL USING (true);
CREATE POLICY "Allow all on teams" ON teams FOR ALL USING (true);
CREATE POLICY "Allow all on preregistered_players" ON preregistered_players FOR ALL USING (true);
CREATE POLICY "Allow all on participants" ON participants FOR ALL USING (true);
CREATE POLICY "Allow all on year_game_sessions" ON year_game_sessions FOR ALL USING (true);
CREATE POLICY "Allow all on year_game_attempts" ON year_game_attempts FOR ALL USING (true);
CREATE POLICY "Allow all on year_game_results" ON year_game_results FOR ALL USING (true);

-- ============================================================
-- 완료
-- ============================================================

COMMENT ON TABLE games IS 'TMC 게임 메인 테이블';
COMMENT ON TABLE teams IS '팀 정보';
COMMENT ON TABLE preregistered_players IS '사전 등록된 선수';
COMMENT ON TABLE participants IS '게임 참가자';
COMMENT ON TABLE year_game_sessions IS 'Year Game (숫자 게임)';
COMMENT ON TABLE year_game_attempts IS 'Year Game 시도 기록';
COMMENT ON TABLE year_game_results IS 'Year Game 결과';
