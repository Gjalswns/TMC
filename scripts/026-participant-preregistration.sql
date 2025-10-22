-- ============================================================
-- 참가자 사전 등록 시스템
-- ============================================================
-- 팀과 선수를 미리 등록하고 게임 입장 시 선택하는 시스템
-- ============================================================

-- 사전 등록된 선수 테이블
CREATE TABLE IF NOT EXISTS preregistered_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_name VARCHAR(100) NOT NULL,
    player_number INTEGER,
    team_name VARCHAR(100) NOT NULL,
    bracket VARCHAR(20) CHECK (bracket IN ('higher', 'lower')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_preregistered_players_team ON preregistered_players(team_name);
CREATE INDEX IF NOT EXISTS idx_preregistered_players_bracket ON preregistered_players(bracket);
CREATE INDEX IF NOT EXISTS idx_preregistered_players_active ON preregistered_players(is_active);

-- 게임 테이블에 브래킷 정보 추가
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS uses_brackets BOOLEAN DEFAULT FALSE;

-- 팀 테이블에 브래킷 정보 추가
ALTER TABLE teams
ADD COLUMN IF NOT EXISTS bracket VARCHAR(20) CHECK (bracket IN ('higher', 'lower', NULL));

-- 참가자 테이블에 사전 등록 선수 참조 추가
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS preregistered_player_id UUID REFERENCES preregistered_players(id);

-- 게임 코드를 2자리 숫자로 변경
ALTER TABLE games
DROP CONSTRAINT IF EXISTS games_join_code_check;

ALTER TABLE games
ADD CONSTRAINT games_join_code_check CHECK (join_code ~ '^[0-9]{2}$');

-- 2자리 게임 코드 생성 함수
CREATE OR REPLACE FUNCTION generate_two_digit_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- 10~99 사이의 랜덤 숫자 생성
        v_code := LPAD((FLOOR(RANDOM() * 90) + 10)::TEXT, 2, '0');
        
        -- 중복 확인
        SELECT EXISTS(
            SELECT 1 FROM games 
            WHERE join_code = v_code 
            AND status IN ('waiting', 'in_progress')
        ) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_code;
END;
$$;

-- CSV 데이터로 선수 일괄 등록 함수
CREATE OR REPLACE FUNCTION bulk_register_players(
    p_players JSONB -- [{player_name, team_name, bracket, player_number}]
)
RETURNS TABLE (
    success BOOLEAN,
    inserted_count INTEGER,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_player JSONB;
    v_count INTEGER := 0;
BEGIN
    -- 기존 데이터 비활성화 (선택적)
    -- UPDATE preregistered_players SET is_active = FALSE;
    
    -- 새 데이터 삽입
    FOR v_player IN SELECT * FROM jsonb_array_elements(p_players)
    LOOP
        INSERT INTO preregistered_players (
            player_name,
            team_name,
            bracket,
            player_number,
            is_active
        ) VALUES (
            v_player->>'player_name',
            v_player->>'team_name',
            v_player->>'bracket',
            (v_player->>'player_number')::INTEGER,
            TRUE
        );
        
        v_count := v_count + 1;
    END LOOP;
    
    RETURN QUERY SELECT TRUE, v_count, format('Successfully registered %s players', v_count);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, 0, SQLERRM;
END;
$$;

-- 사전 등록된 팀 목록 조회
CREATE OR REPLACE FUNCTION get_preregistered_teams()
RETURNS TABLE (
    team_name VARCHAR(100),
    bracket VARCHAR(20),
    player_count BIGINT,
    players JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        prp.team_name,
        prp.bracket,
        COUNT(*) as player_count,
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'id', prp.id,
                'player_name', prp.player_name,
                'player_number', prp.player_number
            ) ORDER BY prp.player_number
        ) as players
    FROM preregistered_players prp
    WHERE prp.is_active = TRUE
    GROUP BY prp.team_name, prp.bracket
    ORDER BY prp.bracket, prp.team_name;
END;
$$;

-- 게임 참가 시 사전 등록된 선수 선택
CREATE OR REPLACE FUNCTION join_game_with_preregistered_player(
    p_game_code TEXT,
    p_player_id UUID
)
RETURNS TABLE (
    game_id UUID,
    team_id UUID,
    participant_id UUID,
    team_name VARCHAR(100),
    player_name VARCHAR(100),
    bracket VARCHAR(20),
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_id UUID;
    v_team_id UUID;
    v_participant_id UUID;
    v_player_record RECORD;
    v_team_record RECORD;
    v_uses_brackets BOOLEAN;
BEGIN
    -- 게임 확인
    SELECT id, uses_brackets INTO v_game_id, v_uses_brackets
    FROM games 
    WHERE join_code = p_game_code 
    AND status IN ('waiting', 'in_progress');
    
    IF v_game_id IS NULL THEN
        RETURN QUERY SELECT 
            NULL::UUID, NULL::UUID, NULL::UUID, 
            NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR,
            FALSE, 'Game not found or not joinable';
        RETURN;
    END IF;
    
    -- 선수 정보 확인
    SELECT * INTO v_player_record
    FROM preregistered_players
    WHERE id = p_player_id AND is_active = TRUE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            v_game_id, NULL::UUID, NULL::UUID,
            NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR,
            FALSE, 'Player not found or inactive';
        RETURN;
    END IF;
    
    -- 이미 참가했는지 확인
    SELECT id INTO v_participant_id
    FROM participants
    WHERE game_id = v_game_id 
    AND preregistered_player_id = p_player_id;
    
    IF v_participant_id IS NOT NULL THEN
        -- 기존 참가자 정보 반환
        SELECT t.id, t.team_name, t.bracket INTO v_team_id, v_team_record
        FROM participants p
        JOIN teams t ON p.team_id = t.id
        WHERE p.id = v_participant_id;
        
        RETURN QUERY SELECT 
            v_game_id, v_team_id, v_participant_id,
            v_team_record.team_name, v_player_record.player_name, v_player_record.bracket,
            TRUE, 'Already joined this game';
        RETURN;
    END IF;
    
    -- 팀 찾기 또는 생성
    SELECT id, team_name, bracket INTO v_team_record
    FROM teams
    WHERE game_id = v_game_id 
    AND team_name = v_player_record.team_name;
    
    IF NOT FOUND THEN
        -- 새 팀 생성
        INSERT INTO teams (game_id, team_name, team_number, bracket, score)
        VALUES (
            v_game_id, 
            v_player_record.team_name,
            (SELECT COALESCE(MAX(team_number), 0) + 1 FROM teams WHERE game_id = v_game_id),
            CASE WHEN v_uses_brackets THEN v_player_record.bracket ELSE NULL END,
            0
        )
        RETURNING id, team_name, bracket INTO v_team_record;
    END IF;
    
    v_team_id := v_team_record.id;
    
    -- 참가자 생성
    INSERT INTO participants (
        game_id,
        team_id,
        nickname,
        user_identifier,
        preregistered_player_id,
        joined_at
    ) VALUES (
        v_game_id,
        v_team_id,
        v_player_record.player_name,
        v_player_record.player_name || '_' || v_team_record.team_name,
        p_player_id,
        NOW()
    )
    RETURNING id INTO v_participant_id;
    
    RETURN QUERY SELECT 
        v_game_id, v_team_id, v_participant_id,
        v_team_record.team_name, v_player_record.player_name, v_player_record.bracket,
        TRUE, 'Successfully joined game';
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 
            v_game_id, NULL::UUID, NULL::UUID,
            NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR,
            FALSE, SQLERRM;
END;
$$;

-- RLS 정책
ALTER TABLE preregistered_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active players"
    ON preregistered_players FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Service role can manage players"
    ON preregistered_players FOR ALL
    USING (TRUE);

-- 실시간 구독 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE preregistered_players;

COMMENT ON TABLE preregistered_players IS '사전 등록된 선수 정보';
COMMENT ON FUNCTION generate_two_digit_code() IS '2자리 게임 코드 생성';
COMMENT ON FUNCTION bulk_register_players(JSONB) IS 'CSV 데이터로 선수 일괄 등록';
COMMENT ON FUNCTION get_preregistered_teams() IS '사전 등록된 팀 목록 조회';
COMMENT ON FUNCTION join_game_with_preregistered_player(TEXT, UUID) IS '사전 등록된 선수로 게임 참가';
