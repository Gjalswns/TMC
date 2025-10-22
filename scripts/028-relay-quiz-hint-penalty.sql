-- ============================================================
-- 릴레이 퀴즈 힌트 페널티 시스템
-- ============================================================
-- 이전 정답을 모를 때 -100점을 받고 올바른 정답을 확인할 수 있음
-- ============================================================

-- 힌트 사용 기록 테이블
CREATE TABLE IF NOT EXISTS relay_quiz_hint_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES relay_quiz_sessions(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    cycle_number INTEGER NOT NULL,
    question_order INTEGER NOT NULL, -- 어떤 문제의 정답을 확인했는지
    revealed_answer TEXT NOT NULL, -- 공개된 정답
    penalty_points INTEGER DEFAULT -100,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, team_id, cycle_number, question_order)
);

CREATE INDEX IF NOT EXISTS idx_hint_usage_session ON relay_quiz_hint_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_hint_usage_team ON relay_quiz_hint_usage(team_id);
CREATE INDEX IF NOT EXISTS idx_hint_usage_cycle ON relay_quiz_hint_usage(cycle_number);

-- 릴레이 퀴즈 팀 진행 상황에 힌트 사용 정보 추가
ALTER TABLE relay_quiz_team_progress
ADD COLUMN IF NOT EXISTS hints_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hint_penalty_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS revealed_answers JSONB DEFAULT '[]'::JSONB; -- [{question_order: 1, answer: "42"}]

-- 힌트 사용 함수 (이전 정답 확인)
CREATE OR REPLACE FUNCTION use_relay_quiz_hint(
    p_session_id UUID,
    p_team_id UUID,
    p_participant_id UUID,
    p_question_order INTEGER -- 확인하고 싶은 이전 문제 순서
)
RETURNS TABLE (
    hint_id UUID,
    revealed_answer TEXT,
    penalty_points INTEGER,
    new_total_score INTEGER,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_hint_id UUID;
    v_session_record RECORD;
    v_progress_record RECORD;
    v_correct_answer TEXT;
    v_question_record RECORD;
    v_new_total_score INTEGER;
    v_penalty INTEGER := -100;
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM relay_quiz_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0, 0, FALSE, 'Session not found or not active';
        RETURN;
    END IF;

    -- 팀 진행 상황 조회
    SELECT * INTO v_progress_record
    FROM relay_quiz_team_progress 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0, 0, FALSE, 'Team progress not found';
        RETURN;
    END IF;

    -- 현재 사이클보다 이전 문제만 확인 가능
    IF p_question_order >= v_progress_record.current_question_order THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0, 0, FALSE, 'Can only reveal previous questions';
        RETURN;
    END IF;

    -- 이미 힌트를 사용했는지 확인
    IF EXISTS(
        SELECT 1 FROM relay_quiz_hint_usage
        WHERE session_id = p_session_id 
        AND team_id = p_team_id
        AND cycle_number = v_progress_record.current_cycle
        AND question_order = p_question_order
    ) THEN
        -- 이미 사용한 힌트는 다시 조회 (무료)
        SELECT revealed_answer INTO v_correct_answer
        FROM relay_quiz_hint_usage
        WHERE session_id = p_session_id 
        AND team_id = p_team_id
        AND cycle_number = v_progress_record.current_cycle
        AND question_order = p_question_order;

        RETURN QUERY SELECT 
            NULL::UUID,
            v_correct_answer,
            0, -- 이미 사용한 힌트는 추가 페널티 없음
            v_progress_record.total_score,
            TRUE,
            'Previously revealed answer (no additional penalty)';
        RETURN;
    END IF;

    -- 이전 사이클에서 해당 문제의 정답 찾기
    -- 현재 사이클 - 1의 사이클에서 같은 순서의 문제 정답
    SELECT cq.correct_answer INTO v_correct_answer
    FROM central_questions cq
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE qc.name = 'relay_' || v_progress_record.current_set_name
        AND cq.order_index = p_question_order
        AND cq.is_active = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0, 0, FALSE, 'Previous question not found';
        RETURN;
    END IF;

    -- 힌트 사용 기록 저장
    INSERT INTO relay_quiz_hint_usage (
        session_id,
        team_id,
        participant_id,
        cycle_number,
        question_order,
        revealed_answer,
        penalty_points
    ) VALUES (
        p_session_id,
        p_team_id,
        p_participant_id,
        v_progress_record.current_cycle,
        p_question_order,
        v_correct_answer,
        v_penalty
    ) RETURNING id INTO v_hint_id;

    -- 팀 점수 차감 및 힌트 사용 정보 업데이트
    UPDATE relay_quiz_team_progress 
    SET 
        total_score = total_score + v_penalty,
        hints_used = hints_used + 1,
        hint_penalty_total = hint_penalty_total + v_penalty,
        revealed_answers = revealed_answers || jsonb_build_object(
            'question_order', p_question_order,
            'answer', v_correct_answer,
            'revealed_at', NOW()
        ),
        updated_at = NOW()
    WHERE session_id = p_session_id AND team_id = p_team_id
    RETURNING total_score INTO v_new_total_score;

    -- 팀 메인 점수도 차감
    UPDATE teams 
    SET score = GREATEST(0, score + v_penalty)
    WHERE id = p_team_id;

    RETURN QUERY SELECT 
        v_hint_id,
        v_correct_answer,
        v_penalty,
        v_new_total_score,
        TRUE,
        'Hint revealed. -100 points penalty applied.';

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0, 0, FALSE, SQLERRM;
END;
$$;

-- 팀의 사용 가능한 힌트 목록 조회
CREATE OR REPLACE FUNCTION get_available_hints(
    p_session_id UUID,
    p_team_id UUID
)
RETURNS TABLE (
    question_order INTEGER,
    can_reveal BOOLEAN,
    already_revealed BOOLEAN,
    revealed_answer TEXT,
    penalty_points INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_progress_record RECORD;
BEGIN
    -- 팀 진행 상황 조회
    SELECT * INTO v_progress_record
    FROM relay_quiz_team_progress 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 현재 문제 이전의 모든 문제에 대해 힌트 정보 반환
    RETURN QUERY
    WITH question_orders AS (
        SELECT generate_series(1, v_progress_record.current_question_order - 1) as q_order
    ),
    hint_status AS (
        SELECT 
            qo.q_order,
            CASE 
                WHEN qo.q_order < v_progress_record.current_question_order THEN TRUE
                ELSE FALSE
            END as can_reveal,
            EXISTS(
                SELECT 1 FROM relay_quiz_hint_usage
                WHERE session_id = p_session_id 
                AND team_id = p_team_id
                AND cycle_number = v_progress_record.current_cycle
                AND question_order = qo.q_order
            ) as already_revealed,
            (
                SELECT revealed_answer FROM relay_quiz_hint_usage
                WHERE session_id = p_session_id 
                AND team_id = p_team_id
                AND cycle_number = v_progress_record.current_cycle
                AND question_order = qo.q_order
            ) as revealed_answer,
            CASE 
                WHEN EXISTS(
                    SELECT 1 FROM relay_quiz_hint_usage
                    WHERE session_id = p_session_id 
                    AND team_id = p_team_id
                    AND cycle_number = v_progress_record.current_cycle
                    AND question_order = qo.q_order
                ) THEN 0
                ELSE -100
            END as penalty_points
        FROM question_orders qo
    )
    SELECT * FROM hint_status
    ORDER BY q_order;
END;
$$;

-- 릴레이 퀴즈 팀 상세 정보 뷰 (힌트 정보 포함)
CREATE OR REPLACE VIEW relay_quiz_team_details AS
SELECT 
    rqtp.session_id,
    rqtp.team_id,
    t.team_name,
    t.team_number,
    rqtp.current_cycle,
    rqtp.current_set_name,
    rqtp.current_question_order,
    rqtp.questions_completed,
    rqtp.total_score,
    rqtp.hints_used,
    rqtp.hint_penalty_total,
    rqtp.revealed_answers,
    rqtp.previous_answers,
    rqtp.cycle_completed_at,
    rqtp.updated_at,
    -- 힌트 사용 내역
    (
        SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                'question_order', rqhu.question_order,
                'revealed_answer', rqhu.revealed_answer,
                'penalty_points', rqhu.penalty_points,
                'used_at', rqhu.used_at,
                'participant_name', p.nickname
            ) ORDER BY rqhu.used_at
        )
        FROM relay_quiz_hint_usage rqhu
        LEFT JOIN participants p ON rqhu.participant_id = p.id
        WHERE rqhu.session_id = rqtp.session_id 
        AND rqhu.team_id = rqtp.team_id
    ) as hint_usage_history
FROM relay_quiz_team_progress rqtp
JOIN teams t ON rqtp.team_id = t.id;

-- 답안 제출 함수 업데이트 (힌트 정보 포함)
CREATE OR REPLACE FUNCTION submit_relay_quiz_answer_with_hints(
    p_session_id UUID,
    p_team_id UUID,
    p_participant_id UUID,
    p_answer TEXT
)
RETURNS TABLE (
    attempt_id UUID,
    is_correct BOOLEAN,
    is_cycle_complete BOOLEAN,
    next_question_order INTEGER,
    available_hints JSONB,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt_id UUID;
    v_session_record RECORD;
    v_progress_record RECORD;
    v_question_record RECORD;
    v_is_correct BOOLEAN := FALSE;
    v_is_cycle_complete BOOLEAN := FALSE;
    v_next_question_order INTEGER;
    v_points_earned INTEGER := 0;
    v_available_hints JSONB;
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM relay_quiz_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, NULL::JSONB, FALSE, 'Session not found or not active';
        RETURN;
    END IF;

    -- 팀 진행 상황 조회
    SELECT * INTO v_progress_record
    FROM relay_quiz_team_progress 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, NULL::JSONB, FALSE, 'Team progress not found';
        RETURN;
    END IF;

    -- 현재 문제 조회
    SELECT cq.* INTO v_question_record
    FROM central_questions cq
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE qc.name = 'relay_' || v_progress_record.current_set_name
        AND cq.order_index = v_progress_record.current_question_order
        AND cq.is_active = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, NULL::JSONB, FALSE, 'Question not found';
        RETURN;
    END IF;

    -- 정답 확인
    v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(v_question_record.correct_answer));

    IF v_is_correct THEN
        v_points_earned := v_question_record.points;
    END IF;

    -- 시도 기록 저장
    INSERT INTO relay_quiz_attempts (
        session_id,
        team_id,
        participant_id,
        question_id,
        answer,
        is_correct,
        points_earned,
        cycle_number,
        set_name,
        used_previous_answers
    ) VALUES (
        p_session_id,
        p_team_id,
        p_participant_id,
        v_question_record.id,
        p_answer,
        v_is_correct,
        v_points_earned,
        v_progress_record.current_cycle,
        v_progress_record.current_set_name,
        v_progress_record.previous_answers
    ) RETURNING id INTO v_attempt_id;

    -- 정답인 경우 진행 상황 업데이트
    IF v_is_correct THEN
        v_next_question_order := v_progress_record.current_question_order + 1;
        v_is_cycle_complete := v_next_question_order > v_progress_record.total_questions;

        UPDATE relay_quiz_team_progress 
        SET 
            current_question_order = CASE 
                WHEN v_is_cycle_complete THEN v_progress_record.current_question_order
                ELSE v_next_question_order
            END,
            questions_completed = v_progress_record.questions_completed + 1,
            total_score = v_progress_record.total_score + v_points_earned,
            last_participant_id = p_participant_id,
            previous_answers = array_append(v_progress_record.previous_answers, p_answer),
            cycle_completed_at = CASE 
                WHEN v_is_cycle_complete THEN NOW()
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE session_id = p_session_id AND team_id = p_team_id;
    ELSE
        v_next_question_order := v_progress_record.current_question_order;
    END IF;

    -- 사용 가능한 힌트 정보 조회
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'question_order', ah.question_order,
            'can_reveal', ah.can_reveal,
            'already_revealed', ah.already_revealed,
            'revealed_answer', ah.revealed_answer,
            'penalty_points', ah.penalty_points
        )
    ) INTO v_available_hints
    FROM get_available_hints(p_session_id, p_team_id) ah;

    RETURN QUERY SELECT 
        v_attempt_id,
        v_is_correct,
        v_is_cycle_complete,
        v_next_question_order,
        COALESCE(v_available_hints, '[]'::JSONB),
        TRUE,
        CASE 
            WHEN v_is_correct AND v_is_cycle_complete THEN 'Correct! Cycle completed!'
            WHEN v_is_correct THEN 'Correct! Next question available.'
            ELSE 'Incorrect answer. Try again.'
        END;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, NULL::JSONB, FALSE, SQLERRM;
END;
$$;

-- RLS 정책
ALTER TABLE relay_quiz_hint_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hint usage"
    ON relay_quiz_hint_usage FOR SELECT
    USING (TRUE);

CREATE POLICY "Service role can manage hint usage"
    ON relay_quiz_hint_usage FOR ALL
    USING (TRUE);

-- 실시간 구독 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_hint_usage;

COMMENT ON TABLE relay_quiz_hint_usage IS '릴레이 퀴즈 힌트 사용 기록 (-100점 페널티)';
COMMENT ON FUNCTION use_relay_quiz_hint IS '이전 정답 확인 (-100점)';
COMMENT ON FUNCTION get_available_hints IS '사용 가능한 힌트 목록 조회';
COMMENT ON FUNCTION submit_relay_quiz_answer_with_hints IS '답안 제출 (힌트 정보 포함)';
