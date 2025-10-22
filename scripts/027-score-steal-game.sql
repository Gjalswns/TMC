-- ============================================================
-- Score Steal 게임 구현
-- ============================================================
-- 점수 탈취 게임: 정답 시 다른 팀 점수 가져오기
-- 오답 시 -50점, 연속 점수 손실 방지
-- ============================================================

-- Score Steal 세션 테이블 수정
ALTER TABLE score_steal_sessions
ADD COLUMN IF NOT EXISTS higher_bracket_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lower_bracket_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS higher_bracket_winner_team_id UUID REFERENCES teams(id),
ADD COLUMN IF NOT EXISTS lower_bracket_winner_team_id UUID REFERENCES teams(id),
ADD COLUMN IF NOT EXISTS steal_targets_selected BOOLEAN DEFAULT FALSE;

-- Score Steal 시도 테이블에 브래킷 정보 추가
ALTER TABLE score_steal_attempts
ADD COLUMN IF NOT EXISTS bracket VARCHAR(20);

-- 팀별 연속 점수 손실 방지를 위한 테이블
CREATE TABLE IF NOT EXISTS score_steal_protection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES score_steal_sessions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES score_steal_questions(id) ON DELETE CASCADE,
    was_stolen_from BOOLEAN DEFAULT FALSE,
    protected_until_question INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, team_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_score_steal_protection_session ON score_steal_protection(session_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_protection_team ON score_steal_protection(team_id);

-- Score Steal 시도 제출 함수 (브래킷 지원)
CREATE OR REPLACE FUNCTION submit_score_steal_attempt(
    p_session_id UUID,
    p_team_id UUID,
    p_participant_id UUID,
    p_question_id UUID,
    p_answer TEXT
)
RETURNS TABLE (
    attempt_id UUID,
    is_correct BOOLEAN,
    points_change INTEGER,
    bracket_locked BOOLEAN,
    waiting_for_other_bracket BOOLEAN,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt_id UUID;
    v_is_correct BOOLEAN := FALSE;
    v_correct_answer TEXT;
    v_points INTEGER;
    v_session_record RECORD;
    v_team_bracket VARCHAR(20);
    v_bracket_locked BOOLEAN := FALSE;
    v_other_bracket_locked BOOLEAN := FALSE;
    v_points_change INTEGER := 0;
BEGIN
    -- 세션 정보 확인
    SELECT * INTO v_session_record
    FROM score_steal_sessions
    WHERE id = p_session_id AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, 0, FALSE, FALSE, FALSE, 
            'Session not found or not active';
        RETURN;
    END IF;
    
    -- 팀 브래킷 확인
    SELECT bracket INTO v_team_bracket
    FROM teams
    WHERE id = p_team_id;
    
    -- 브래킷이 이미 잠겼는지 확인
    IF v_team_bracket = 'higher' AND v_session_record.higher_bracket_locked THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, 0, TRUE, TRUE, FALSE,
            'Your bracket is locked. Waiting for other bracket.';
        RETURN;
    END IF;
    
    IF v_team_bracket = 'lower' AND v_session_record.lower_bracket_locked THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, 0, TRUE, TRUE, FALSE,
            'Your bracket is locked. Waiting for other bracket.';
        RETURN;
    END IF;
    
    -- 문제 정보 확인
    SELECT correct_answer, points INTO v_correct_answer, v_points
    FROM score_steal_questions
    WHERE id = p_question_id;
    
    -- 정답 확인 (대소문자 무시, 공백 제거)
    v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(v_correct_answer));
    
    -- 시도 기록
    INSERT INTO score_steal_attempts (
        session_id,
        team_id,
        participant_id,
        question_id,
        answer,
        is_correct,
        bracket,
        submitted_at
    ) VALUES (
        p_session_id,
        p_team_id,
        p_participant_id,
        p_question_id,
        p_answer,
        v_is_correct,
        v_team_bracket,
        NOW()
    )
    RETURNING id INTO v_attempt_id;
    
    IF v_is_correct THEN
        -- 정답: 브래킷 잠금
        IF v_team_bracket = 'higher' THEN
            UPDATE score_steal_sessions
            SET higher_bracket_locked = TRUE,
                higher_bracket_winner_team_id = p_team_id
            WHERE id = p_session_id;
            
            v_bracket_locked := TRUE;
            
            -- 다른 브래킷 상태 확인
            SELECT lower_bracket_locked INTO v_other_bracket_locked
            FROM score_steal_sessions
            WHERE id = p_session_id;
        ELSE
            UPDATE score_steal_sessions
            SET lower_bracket_locked = TRUE,
                lower_bracket_winner_team_id = p_team_id
            WHERE id = p_session_id;
            
            v_bracket_locked := TRUE;
            
            -- 다른 브래킷 상태 확인
            SELECT higher_bracket_locked INTO v_other_bracket_locked
            FROM score_steal_sessions
            WHERE id = p_session_id;
        END IF;
        
        RETURN QUERY SELECT 
            v_attempt_id, TRUE, 0, v_bracket_locked, NOT v_other_bracket_locked, TRUE,
            'Correct! Your bracket is now locked. Waiting for other bracket...';
    ELSE
        -- 오답: -50점
        v_points_change := -50;
        
        UPDATE teams
        SET score = GREATEST(0, score + v_points_change)
        WHERE id = p_team_id;
        
        RETURN QUERY SELECT 
            v_attempt_id, FALSE, v_points_change, FALSE, FALSE, TRUE,
            'Incorrect. -50 points.';
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, 0, FALSE, FALSE, FALSE, SQLERRM;
END;
$$;

-- 점수 탈취 대상 선택 및 실행
CREATE OR REPLACE FUNCTION execute_score_steal(
    p_session_id UUID,
    p_question_id UUID,
    p_higher_target_team_id UUID,
    p_lower_target_team_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    steal_details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_record RECORD;
    v_question_points INTEGER;
    v_higher_winner_team_id UUID;
    v_lower_winner_team_id UUID;
    v_higher_target_protected BOOLEAN;
    v_lower_target_protected BOOLEAN;
    v_steal_details JSONB;
BEGIN
    -- 세션 정보 확인
    SELECT * INTO v_session_record
    FROM score_steal_sessions
    WHERE id = p_session_id AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Session not found or not active', NULL::JSONB;
        RETURN;
    END IF;
    
    -- 양쪽 브래킷 모두 잠겼는지 확인
    IF NOT (v_session_record.higher_bracket_locked AND v_session_record.lower_bracket_locked) THEN
        RETURN QUERY SELECT FALSE, 'Both brackets must be locked before stealing', NULL::JSONB;
        RETURN;
    END IF;
    
    -- 문제 배점 확인
    SELECT points INTO v_question_points
    FROM score_steal_questions
    WHERE id = p_question_id;
    
    -- 승자 팀 확인
    v_higher_winner_team_id := v_session_record.higher_bracket_winner_team_id;
    v_lower_winner_team_id := v_session_record.lower_bracket_winner_team_id;
    
    -- 보호 상태 확인 (연속 점수 손실 방지)
    SELECT EXISTS(
        SELECT 1 FROM score_steal_protection
        WHERE session_id = p_session_id 
        AND team_id = p_higher_target_team_id
        AND was_stolen_from = TRUE
    ) INTO v_higher_target_protected;
    
    SELECT EXISTS(
        SELECT 1 FROM score_steal_protection
        WHERE session_id = p_session_id 
        AND team_id = p_lower_target_team_id
        AND was_stolen_from = TRUE
    ) INTO v_lower_target_protected;
    
    -- Higher bracket 점수 탈취
    IF NOT v_higher_target_protected THEN
        -- 대상 팀에서 점수 차감
        UPDATE teams
        SET score = GREATEST(0, score - v_question_points)
        WHERE id = p_higher_target_team_id;
        
        -- 승자 팀에 점수 추가
        UPDATE teams
        SET score = score + v_question_points
        WHERE id = v_higher_winner_team_id;
        
        -- 보호 기록
        INSERT INTO score_steal_protection (
            session_id, team_id, question_id, was_stolen_from
        ) VALUES (
            p_session_id, p_higher_target_team_id, p_question_id, TRUE
        );
    END IF;
    
    -- Lower bracket 점수 탈취
    IF NOT v_lower_target_protected THEN
        -- 대상 팀에서 점수 차감
        UPDATE teams
        SET score = GREATEST(0, score - v_question_points)
        WHERE id = p_lower_target_team_id;
        
        -- 승자 팀에 점수 추가
        UPDATE teams
        SET score = score + v_question_points
        WHERE id = v_lower_winner_team_id;
        
        -- 보호 기록
        INSERT INTO score_steal_protection (
            session_id, team_id, question_id, was_stolen_from
        ) VALUES (
            p_session_id, p_lower_target_team_id, p_question_id, TRUE
        );
    END IF;
    
    -- 세션 상태 업데이트
    UPDATE score_steal_sessions
    SET higher_bracket_locked = FALSE,
        lower_bracket_locked = FALSE,
        higher_bracket_winner_team_id = NULL,
        lower_bracket_winner_team_id = NULL,
        steal_targets_selected = FALSE
    WHERE id = p_session_id;
    
    -- 결과 JSON 생성
    SELECT JSONB_BUILD_OBJECT(
        'higher_bracket', JSONB_BUILD_OBJECT(
            'winner_team_id', v_higher_winner_team_id,
            'target_team_id', p_higher_target_team_id,
            'points_stolen', CASE WHEN v_higher_target_protected THEN 0 ELSE v_question_points END,
            'was_protected', v_higher_target_protected
        ),
        'lower_bracket', JSONB_BUILD_OBJECT(
            'winner_team_id', v_lower_winner_team_id,
            'target_team_id', p_lower_target_team_id,
            'points_stolen', CASE WHEN v_lower_target_protected THEN 0 ELSE v_question_points END,
            'was_protected', v_lower_target_protected
        )
    ) INTO v_steal_details;
    
    RETURN QUERY SELECT TRUE, 'Score steal executed successfully', v_steal_details;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, NULL::JSONB;
END;
$$;

-- 현재 Score Steal 상태 조회
CREATE OR REPLACE VIEW score_steal_current_state AS
SELECT 
    sss.id as session_id,
    sss.game_id,
    sss.current_question_index,
    sss.status,
    sss.higher_bracket_locked,
    sss.lower_bracket_locked,
    sss.steal_targets_selected,
    hw.id as higher_winner_team_id,
    hw.team_name as higher_winner_team_name,
    lw.id as lower_winner_team_id,
    lw.team_name as lower_winner_team_name,
    CASE 
        WHEN sss.higher_bracket_locked AND sss.lower_bracket_locked THEN 'ready_to_steal'
        WHEN sss.higher_bracket_locked OR sss.lower_bracket_locked THEN 'waiting_for_bracket'
        ELSE 'active'
    END as phase
FROM score_steal_sessions sss
LEFT JOIN teams hw ON sss.higher_bracket_winner_team_id = hw.id
LEFT JOIN teams lw ON sss.lower_bracket_winner_team_id = lw.id
WHERE sss.status = 'active';

-- RLS 정책
ALTER TABLE score_steal_protection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view protection status"
    ON score_steal_protection FOR SELECT
    USING (TRUE);

CREATE POLICY "Service role can manage protection"
    ON score_steal_protection FOR ALL
    USING (TRUE);

-- 실시간 구독 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_protection;

COMMENT ON TABLE score_steal_protection IS '점수 탈취 보호 (연속 손실 방지)';
COMMENT ON FUNCTION submit_score_steal_attempt IS 'Score Steal 시도 제출 (브래킷 잠금)';
COMMENT ON FUNCTION execute_score_steal IS '점수 탈취 실행';
