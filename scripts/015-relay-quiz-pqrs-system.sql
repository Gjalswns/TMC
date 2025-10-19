-- ============================================================
-- 릴레이 퀴즈 P,Q,R,S 세트 순환 시스템
-- ============================================================
-- A,B,C,D가 p-1, q-1, r-1, s-1 문제를 푼 후
-- A,B,C,D가 q-2, r-2, s-2, p-2 문제를 푸는 순환 구조
-- 이전 정답을 다음 문제에서 활용
-- ============================================================

-- 릴레이 퀴즈 세션 테이블 수정 (순환 구조 지원)
ALTER TABLE relay_quiz_sessions 
ADD COLUMN IF NOT EXISTS current_cycle INTEGER DEFAULT 1, -- 현재 사이클 (1,2,3,4)
ADD COLUMN IF NOT EXISTS questions_per_cycle INTEGER DEFAULT 4, -- 사이클당 문제 수
ADD COLUMN IF NOT EXISTS cycle_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cycle_time_limit_seconds INTEGER DEFAULT 300; -- 사이클당 5분

-- 릴레이 퀴즈 팀 진행 상황 테이블 수정
ALTER TABLE relay_quiz_team_progress
ADD COLUMN IF NOT EXISTS current_cycle INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS current_set_name VARCHAR(10), -- 'p', 'q', 'r', 's'
ADD COLUMN IF NOT EXISTS previous_answers TEXT[], -- 이전 정답들 저장
ADD COLUMN IF NOT EXISTS cycle_completed_at TIMESTAMP WITH TIME ZONE;

-- 릴레이 퀴즈 시도 테이블 수정
ALTER TABLE relay_quiz_attempts
ADD COLUMN IF NOT EXISTS cycle_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS set_name VARCHAR(10), -- 'p', 'q', 'r', 's'
ADD COLUMN IF NOT EXISTS used_previous_answers TEXT[]; -- 사용한 이전 정답들

-- P,Q,R,S 세트 순환 매핑 뷰
CREATE OR REPLACE VIEW relay_quiz_cycle_mapping AS
WITH cycle_data AS (
    SELECT 
        team_number,
        cycle_number,
        CASE 
            WHEN team_number = 1 THEN 
                CASE cycle_number
                    WHEN 1 THEN 'p'
                    WHEN 2 THEN 'q' 
                    WHEN 3 THEN 'r'
                    WHEN 4 THEN 's'
                END
            WHEN team_number = 2 THEN 
                CASE cycle_number
                    WHEN 1 THEN 'q'
                    WHEN 2 THEN 'r'
                    WHEN 3 THEN 's' 
                    WHEN 4 THEN 'p'
                END
            WHEN team_number = 3 THEN 
                CASE cycle_number
                    WHEN 1 THEN 'r'
                    WHEN 2 THEN 's'
                    WHEN 3 THEN 'p'
                    WHEN 4 THEN 'q'
                END
            WHEN team_number = 4 THEN 
                CASE cycle_number
                    WHEN 1 THEN 's'
                    WHEN 2 THEN 'p'
                    WHEN 3 THEN 'q'
                    WHEN 4 THEN 'r'
                END
        END as set_name
    FROM generate_series(1, 4) as team_number
    CROSS JOIN generate_series(1, 4) as cycle_number
)
SELECT * FROM cycle_data;

-- 릴레이 퀴즈 세션 시작 함수
CREATE OR REPLACE FUNCTION start_relay_quiz_session(
    p_game_id UUID,
    p_round_number INTEGER,
    p_cycle_time_limit INTEGER DEFAULT 300
)
RETURNS TABLE (
    session_id UUID,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_id UUID;
    v_team_record RECORD;
BEGIN
    -- 기존 활성 세션 종료
    UPDATE relay_quiz_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE game_id = p_game_id AND status = 'active';

    -- 새 세션 생성
    INSERT INTO relay_quiz_sessions (
        game_id, 
        round_number, 
        status, 
        time_limit_seconds,
        cycle_time_limit_seconds,
        current_cycle,
        questions_per_cycle,
        started_at,
        cycle_started_at
    ) VALUES (
        p_game_id, 
        p_round_number, 
        'active', 
        p_cycle_time_limit * 4, -- 총 시간 = 사이클당 시간 × 4
        p_cycle_time_limit,
        1, -- 첫 번째 사이클부터 시작
        4, -- 사이클당 4문제
        NOW(),
        NOW()
    ) RETURNING id INTO v_session_id;

    -- 모든 팀에 대해 진행 상황 초기화
    FOR v_team_record IN 
        SELECT id, team_number FROM teams WHERE game_id = p_game_id
    LOOP
        INSERT INTO relay_quiz_team_progress (
            session_id, 
            team_id, 
            current_question_order,
            total_questions,
            questions_completed,
            total_score,
            current_cycle,
            current_set_name,
            previous_answers
        ) VALUES (
            v_session_id, 
            v_team_record.id, 
            1, -- 첫 번째 문제부터
            4, -- 사이클당 4문제
            0,
            0,
            1, -- 첫 번째 사이클
            -- 팀 번호에 따른 첫 번째 세트 결정
            CASE v_team_record.team_number
                WHEN 1 THEN 'p'
                WHEN 2 THEN 'q'
                WHEN 3 THEN 'r'
                WHEN 4 THEN 's'
                ELSE 'p' -- 기본값
            END,
            ARRAY[]::TEXT[] -- 빈 배열로 시작
        );
    END LOOP;

    RETURN QUERY SELECT v_session_id, TRUE, 'Relay Quiz session started successfully';

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, SQLERRM;
END;
$$;

-- 다음 사이클로 진행 함수
CREATE OR REPLACE FUNCTION advance_relay_quiz_cycle(p_session_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    new_cycle INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_record RECORD;
    v_new_cycle INTEGER;
    v_team_record RECORD;
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM relay_quiz_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Session not found or not active', 0;
        RETURN;
    END IF;

    -- 다음 사이클 계산
    v_new_cycle := v_session_record.current_cycle + 1;

    IF v_new_cycle > 4 THEN
        RETURN QUERY SELECT FALSE, 'All cycles completed', v_session_record.current_cycle;
        RETURN;
    END IF;

    -- 세션 사이클 업데이트
    UPDATE relay_quiz_sessions 
    SET 
        current_cycle = v_new_cycle,
        cycle_started_at = NOW()
    WHERE id = p_session_id;

    -- 모든 팀의 진행 상황 업데이트
    FOR v_team_record IN 
        SELECT rqtp.team_id, t.team_number, rqtp.previous_answers
        FROM relay_quiz_team_progress rqtp
        JOIN teams t ON rqtp.team_id = t.id
        WHERE rqtp.session_id = p_session_id
    LOOP
        UPDATE relay_quiz_team_progress 
        SET 
            current_cycle = v_new_cycle,
            current_question_order = 1, -- 새 사이클의 첫 번째 문제
            questions_completed = 0, -- 사이클별 완료 문제 수 리셋
            current_set_name = (
                SELECT set_name 
                FROM relay_quiz_cycle_mapping 
                WHERE team_number = v_team_record.team_number 
                    AND cycle_number = v_new_cycle
            ),
            cycle_completed_at = NULL
        WHERE session_id = p_session_id AND team_id = v_team_record.team_id;
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Advanced to cycle ' || v_new_cycle, v_new_cycle;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, 0;
END;
$$;

-- 릴레이 퀴즈 답안 제출 함수 (이전 정답 활용)
CREATE OR REPLACE FUNCTION submit_relay_quiz_answer(
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
    available_previous_answers TEXT[],
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
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM relay_quiz_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, ARRAY[]::TEXT[], FALSE, 'Session not found or not active';
        RETURN;
    END IF;

    -- 팀 진행 상황 조회
    SELECT * INTO v_progress_record
    FROM relay_quiz_team_progress 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, ARRAY[]::TEXT[], FALSE, 'Team progress not found';
        RETURN;
    END IF;

    -- 현재 문제 조회 (중앙 문제 테이블에서)
    SELECT cq.* INTO v_question_record
    FROM central_questions cq
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE qc.name = 'relay_' || v_progress_record.current_set_name
        AND cq.order_index = v_progress_record.current_question_order
        AND cq.is_active = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, ARRAY[]::TEXT[], FALSE, 'Question not found';
        RETURN;
    END IF;

    -- 정답 확인 (대소문자 무시, 공백 제거)
    v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(v_question_record.correct_answer));

    -- 점수 계산 (정답시에만)
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
        previous_answer,
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
        CASE 
            WHEN array_length(v_progress_record.previous_answers, 1) >= v_progress_record.current_question_order - 1
            THEN v_progress_record.previous_answers[v_progress_record.current_question_order - 1]
            ELSE NULL
        END,
        v_points_earned,
        v_progress_record.current_cycle,
        v_progress_record.current_set_name,
        v_progress_record.previous_answers
    ) RETURNING id INTO v_attempt_id;

    -- 정답인 경우 진행 상황 업데이트
    IF v_is_correct THEN
        -- 다음 문제 순서 계산
        v_next_question_order := v_progress_record.current_question_order + 1;
        
        -- 사이클 완료 여부 확인
        v_is_cycle_complete := v_next_question_order > v_progress_record.total_questions;

        -- 이전 정답 배열에 현재 정답 추가
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

    RETURN QUERY SELECT 
        v_attempt_id,
        v_is_correct,
        v_is_cycle_complete,
        v_next_question_order,
        v_progress_record.previous_answers,
        TRUE,
        CASE 
            WHEN v_is_correct AND v_is_cycle_complete THEN 'Correct! Cycle completed!'
            WHEN v_is_correct THEN 'Correct! Next question available.'
            ELSE 'Incorrect answer. Try again.'
        END;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, ARRAY[]::TEXT[], FALSE, SQLERRM;
END;
$$;

-- 릴레이 퀴즈 세션 종료 및 점수 합산 함수
CREATE OR REPLACE FUNCTION finish_relay_quiz_session(p_session_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    final_scores JSON
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_id UUID;
    v_team_record RECORD;
    v_final_scores JSON;
BEGIN
    -- 세션 정보 확인
    SELECT game_id INTO v_game_id
    FROM relay_quiz_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Session not found or already finished', NULL::JSON;
        RETURN;
    END IF;

    -- 세션 종료
    UPDATE relay_quiz_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE id = p_session_id;

    -- 각 팀의 릴레이 퀴즈 점수를 메인 점수에 합산
    FOR v_team_record IN
        SELECT rqtp.team_id, rqtp.total_score as relay_score
        FROM relay_quiz_team_progress rqtp
        WHERE rqtp.session_id = p_session_id
    LOOP
        UPDATE teams 
        SET score = score + v_team_record.relay_score
        WHERE id = v_team_record.team_id;
    END LOOP;

    -- 최종 결과 JSON 생성
    SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'team_id', rqtp.team_id,
            'team_name', t.team_name,
            'relay_score', rqtp.total_score,
            'questions_completed', rqtp.questions_completed,
            'cycles_completed', CASE WHEN rqtp.cycle_completed_at IS NOT NULL THEN rqtp.current_cycle ELSE rqtp.current_cycle - 1 END,
            'ranking', ROW_NUMBER() OVER (ORDER BY rqtp.total_score DESC, rqtp.questions_completed DESC)
        )
    ) INTO v_final_scores
    FROM relay_quiz_team_progress rqtp
    JOIN teams t ON rqtp.team_id = t.id
    WHERE rqtp.session_id = p_session_id;

    RETURN QUERY SELECT TRUE, 'Relay Quiz session finished successfully', v_final_scores;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, NULL::JSON;
END;
$$;

-- 팀별 현재 문제 조회 함수
CREATE OR REPLACE FUNCTION get_team_current_question(
    p_session_id UUID,
    p_team_id UUID
)
RETURNS TABLE (
    question_id UUID,
    question_title VARCHAR(255),
    question_image_url TEXT,
    question_order INTEGER,
    set_name VARCHAR(10),
    cycle_number INTEGER,
    previous_answers TEXT[],
    time_remaining_seconds INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_progress_record RECORD;
    v_session_record RECORD;
    v_question_record RECORD;
    v_time_remaining INTEGER;
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM relay_quiz_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 팀 진행 상황 조회
    SELECT * INTO v_progress_record
    FROM relay_quiz_team_progress 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    IF NOT FOUND THEN
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
        RETURN;
    END IF;

    -- 남은 시간 계산
    v_time_remaining := GREATEST(0, 
        v_session_record.cycle_time_limit_seconds - 
        EXTRACT(EPOCH FROM (NOW() - v_session_record.cycle_started_at))::INTEGER
    );

    RETURN QUERY SELECT 
        v_question_record.id,
        v_question_record.title,
        v_question_record.question_image_url,
        v_progress_record.current_question_order,
        v_progress_record.current_set_name,
        v_progress_record.current_cycle,
        v_progress_record.previous_answers,
        v_time_remaining;
END;
$$;

-- 릴레이 퀴즈 실시간 대시보드 뷰
CREATE OR REPLACE VIEW relay_quiz_live_dashboard AS
SELECT 
    rqs.id as session_id,
    rqs.game_id,
    rqs.round_number,
    rqs.status,
    rqs.current_cycle,
    rqs.cycle_started_at,
    rqs.cycle_time_limit_seconds,
    GREATEST(0, 
        rqs.cycle_time_limit_seconds - 
        EXTRACT(EPOCH FROM (NOW() - rqs.cycle_started_at))::INTEGER
    ) as cycle_time_remaining_seconds,
    JSON_AGG(
        JSON_BUILD_OBJECT(
            'team_id', rqtp.team_id,
            'team_name', t.team_name,
            'team_number', t.team_number,
            'current_cycle', rqtp.current_cycle,
            'current_set_name', rqtp.current_set_name,
            'current_question_order', rqtp.current_question_order,
            'questions_completed', rqtp.questions_completed,
            'total_score', rqtp.total_score,
            'previous_answers', rqtp.previous_answers,
            'cycle_completed_at', rqtp.cycle_completed_at,
            'last_participant_name', p.nickname
        )
        ORDER BY t.team_number
    ) as teams_progress
FROM relay_quiz_sessions rqs
JOIN relay_quiz_team_progress rqtp ON rqs.id = rqtp.session_id
JOIN teams t ON rqtp.team_id = t.id
LEFT JOIN participants p ON rqtp.last_participant_id = p.id
WHERE rqs.status = 'active'
GROUP BY 
    rqs.id, rqs.game_id, rqs.round_number, rqs.status, 
    rqs.current_cycle, rqs.cycle_started_at, rqs.cycle_time_limit_seconds;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_relay_quiz_sessions_current_cycle ON relay_quiz_sessions(current_cycle);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_team_progress_cycle ON relay_quiz_team_progress(current_cycle);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_team_progress_set ON relay_quiz_team_progress(current_set_name);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_cycle ON relay_quiz_attempts(cycle_number);
CREATE INDEX IF NOT EXISTS idx_relay_quiz_attempts_set ON relay_quiz_attempts(set_name);