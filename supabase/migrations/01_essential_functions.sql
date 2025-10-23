-- ============================================================
-- TMC Game Platform - Essential Functions
-- ============================================================
-- 게임 운영에 필요한 핵심 함수들
-- ============================================================

-- ============================================================
-- 1. 게임 코드 생성 (2자리 숫자)
-- ============================================================

CREATE OR REPLACE FUNCTION generate_two_digit_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- 10~99 사이의 랜덤 숫자
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

-- ============================================================
-- 2. 팀 점수 안전하게 증가
-- ============================================================

CREATE OR REPLACE FUNCTION increment_team_score_safe(
    p_team_id UUID,
    p_points INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE teams
    SET score = score + p_points,
        updated_at = NOW()
    WHERE id = p_team_id;
    
    RETURN FOUND;
END;
$$;

-- ============================================================
-- 3. 사전 등록 선수 일괄 등록
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_register_players(
    p_players JSONB
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

-- ============================================================
-- 4. 사전 등록된 팀 목록 조회
-- ============================================================

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

-- ============================================================
-- 5. 사전 등록 선수로 게임 참가
-- ============================================================

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
            FALSE, 'Game not found';
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
            FALSE, 'Player not found';
        RETURN;
    END IF;
    
    -- 이미 참가했는지 확인
    SELECT id INTO v_participant_id
    FROM participants
    WHERE game_id = v_game_id 
    AND preregistered_player_id = p_player_id;
    
    IF v_participant_id IS NOT NULL THEN
        SELECT t.id, t.team_name, t.bracket INTO v_team_record
        FROM participants p
        JOIN teams t ON p.team_id = t.id
        WHERE p.id = v_participant_id;
        
        RETURN QUERY SELECT 
            v_game_id, v_team_record.id, v_participant_id,
            v_team_record.team_name, v_player_record.player_name, v_player_record.bracket,
            TRUE, 'Already joined';
        RETURN;
    END IF;
    
    -- 팀 찾기 또는 생성
    SELECT id, team_name, bracket INTO v_team_record
    FROM teams
    WHERE game_id = v_game_id 
    AND team_name = v_player_record.team_name;
    
    IF NOT FOUND THEN
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
        TRUE, 'Successfully joined';
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 
            v_game_id, NULL::UUID, NULL::UUID,
            NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR,
            FALSE, SQLERRM;
END;
$$;

-- ============================================================
-- 6. 문제 관리 함수들
-- ============================================================

-- 카테고리별 문제 조회
CREATE OR REPLACE FUNCTION get_questions_by_category(category_name TEXT)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    question_image_url TEXT,
    correct_answer TEXT,
    difficulty VARCHAR(10),
    points INTEGER,
    order_index INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cq.id,
        cq.title,
        cq.question_image_url,
        cq.correct_answer,
        cq.difficulty,
        cq.points,
        cq.order_index
    FROM central_questions cq
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE qc.name = category_name AND cq.is_active = true
    ORDER BY cq.order_index, cq.created_at;
END;
$$;

-- 게임에 문제 할당
CREATE OR REPLACE FUNCTION assign_questions_to_game(
    p_game_id UUID,
    p_score_steal_count INTEGER DEFAULT 10,
    p_relay_questions_per_set INTEGER DEFAULT 4
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    category_record RECORD;
    question_record RECORD;
    assignment_count INTEGER;
BEGIN
    -- 점수 뺏기 문제 할당
    INSERT INTO game_question_assignments (game_id, question_id, game_type)
    SELECT 
        p_game_id,
        cq.id,
        'score_steal'
    FROM central_questions cq
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE qc.name = 'score_steal' AND cq.is_active = true
    ORDER BY RANDOM()
    LIMIT p_score_steal_count;

    -- 릴레이 퀴즈 문제 할당 (P, Q, R, S)
    FOR category_record IN 
        SELECT id, name FROM question_categories 
        WHERE name IN ('relay_p', 'relay_q', 'relay_r', 'relay_s')
    LOOP
        assignment_count := 0;
        
        FOR question_record IN
            SELECT id, order_index
            FROM central_questions 
            WHERE category_id = category_record.id AND is_active = true
            ORDER BY order_index
            LIMIT p_relay_questions_per_set
        LOOP
            assignment_count := assignment_count + 1;
            
            -- Round 3과 4에 할당
            INSERT INTO game_question_assignments (
                game_id, question_id, game_type, round_number, question_order
            ) VALUES 
            (p_game_id, question_record.id, 'relay_quiz', 3, assignment_count),
            (p_game_id, question_record.id, 'relay_quiz', 4, assignment_count);
        END LOOP;
    END LOOP;

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- ============================================================
-- 7. Year Game 함수들
-- ============================================================

-- Year Game 결과 업데이트
CREATE OR REPLACE FUNCTION update_year_game_result(
    p_session_id UUID,
    p_team_id UUID,
    p_number INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO year_game_results (session_id, team_id, numbers_found, total_found, score)
    VALUES (
        p_session_id,
        p_team_id,
        ARRAY[p_number],
        1,
        p_number
    )
    ON CONFLICT (session_id, team_id) 
    DO UPDATE SET
        numbers_found = array_append(year_game_results.numbers_found, p_number),
        total_found = year_game_results.total_found + 1,
        score = year_game_results.score + p_number,
        updated_at = NOW();
    
    RETURN TRUE;
END;
$$;

-- ============================================================
-- 8. Score Steal 함수들
-- ============================================================

-- 보호된 팀 확인
CREATE OR REPLACE FUNCTION is_team_protected(
    p_game_id UUID,
    p_round_number INTEGER,
    p_team_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_protected BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM score_steal_protected_teams
        WHERE game_id = p_game_id
        AND round_number = p_round_number
        AND team_id = p_team_id
        AND protected_until > NOW()
    ) INTO v_protected;
    
    RETURN v_protected;
END;
$$;

-- 팀 보호 설정
CREATE OR REPLACE FUNCTION protect_team(
    p_game_id UUID,
    p_round_number INTEGER,
    p_team_id UUID,
    p_duration_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO score_steal_protected_teams (
        game_id,
        round_number,
        team_id,
        protected_until
    ) VALUES (
        p_game_id,
        p_round_number,
        p_team_id,
        NOW() + (p_duration_seconds || ' seconds')::INTERVAL
    )
    ON CONFLICT (game_id, round_number, team_id)
    DO UPDATE SET
        protected_until = NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
    
    RETURN TRUE;
END;
$$;

-- ============================================================
-- 9. Relay Quiz 함수들
-- ============================================================

-- 팀의 현재 문제 가져오기
CREATE OR REPLACE FUNCTION get_current_question_for_team(
    p_session_id UUID,
    p_team_id UUID
)
RETURNS TABLE (
    question_id UUID,
    question_order INTEGER,
    question_image_url TEXT,
    previous_answer TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cq.id as question_id,
        gqa.question_order,
        cq.question_image_url,
        (
            SELECT answer 
            FROM relay_quiz_attempts 
            WHERE session_id = p_session_id 
            AND team_id = p_team_id 
            AND is_correct = true
            ORDER BY submitted_at DESC 
            LIMIT 1
        ) as previous_answer
    FROM relay_quiz_team_progress rqtp
    JOIN relay_quiz_sessions rqs ON rqtp.session_id = rqs.id
    JOIN game_question_assignments gqa ON gqa.game_id = rqs.game_id 
        AND gqa.round_number = rqs.round_number
        AND gqa.question_order = rqtp.current_question_order
    JOIN central_questions cq ON gqa.question_id = cq.id
    WHERE rqtp.session_id = p_session_id
    AND rqtp.team_id = p_team_id
    LIMIT 1;
END;
$$;

-- ============================================================
-- 10. 트리거 함수들
-- ============================================================

-- updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 적용
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_preregistered_players_updated_at
    BEFORE UPDATE ON preregistered_players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 완료
-- ============================================================

COMMENT ON FUNCTION generate_two_digit_code() IS '2자리 게임 코드 생성';
COMMENT ON FUNCTION increment_team_score_safe(UUID, INTEGER) IS '팀 점수 안전하게 증가';
COMMENT ON FUNCTION bulk_register_players(JSONB) IS '선수 일괄 등록';
COMMENT ON FUNCTION join_game_with_preregistered_player(TEXT, UUID) IS '사전 등록 선수로 게임 참가';
COMMENT ON FUNCTION update_year_game_result(UUID, UUID, INTEGER) IS 'Year Game 결과 업데이트';
