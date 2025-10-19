-- ============================================================
-- 점수 뺏기 게임 실시간 동시 출제 시스템
-- ============================================================
-- 모든 팀에게 동시에 같은 문제 출제
-- 정답자가 나타나면 즉시 입력창 닫기
-- 연속 방지 로직 (한 팀이 연속으로 점수를 뺏지 못하도록)
-- ============================================================

-- 점수 뺏기 세션 테이블 수정 (실시간 기능 추가)
ALTER TABLE score_steal_sessions 
ADD COLUMN IF NOT EXISTS current_question_id UUID REFERENCES central_questions(id),
ADD COLUMN IF NOT EXISTS question_broadcast_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS input_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS winner_team_id UUID REFERENCES teams(id),
ADD COLUMN IF NOT EXISTS winner_response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS last_winner_team_id UUID REFERENCES teams(id); -- 연속 방지용

-- 점수 뺏기 시도 테이블 수정 (실시간 응답 추가)
ALTER TABLE score_steal_attempts
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES score_steal_sessions(id),
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT false;

-- 점수 뺏기 실시간 세션 상태 뷰
CREATE OR REPLACE VIEW score_steal_live_session AS
SELECT 
    sss.id as session_id,
    sss.game_id,
    sss.round_number,
    sss.status,
    sss.current_question_id,
    sss.question_broadcast_at,
    sss.input_locked,
    sss.winner_team_id,
    sss.winner_response_time_ms,
    sss.last_winner_team_id,
    cq.title as question_title,
    cq.question_image_url,
    cq.correct_answer,
    cq.difficulty,
    cq.points,
    wt.team_name as winner_team_name,
    lwt.team_name as last_winner_team_name,
    sss.started_at,
    sss.ended_at
FROM score_steal_sessions sss
LEFT JOIN central_questions cq ON sss.current_question_id = cq.id
LEFT JOIN teams wt ON sss.winner_team_id = wt.id
LEFT JOIN teams lwt ON sss.last_winner_team_id = lwt.id
WHERE sss.status IN ('active', 'waiting');

-- 실시간 점수 뺏기 게임 시작 함수
CREATE OR REPLACE FUNCTION start_score_steal_realtime_session(
    p_game_id UUID,
    p_round_number INTEGER DEFAULT 2
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
BEGIN
    -- 기존 활성 세션 종료
    UPDATE score_steal_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE game_id = p_game_id AND status = 'active';

    -- 새 세션 생성
    INSERT INTO score_steal_sessions (
        game_id, 
        round_number, 
        status, 
        started_at,
        input_locked
    ) VALUES (
        p_game_id, 
        p_round_number, 
        'active', 
        NOW(),
        false
    ) RETURNING id INTO v_session_id;

    RETURN QUERY SELECT v_session_id, TRUE, 'Score Steal realtime session started successfully';

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, SQLERRM;
END;
$$;

-- 문제 브로드캐스트 함수 (모든 팀에게 동시 출제)
CREATE OR REPLACE FUNCTION broadcast_score_steal_question(
    p_session_id UUID,
    p_question_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    broadcast_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_broadcast_time TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- 세션 상태 확인
    IF NOT EXISTS (
        SELECT 1 FROM score_steal_sessions 
        WHERE id = p_session_id AND status = 'active'
    ) THEN
        RETURN QUERY SELECT FALSE, 'Session not found or not active', NULL::TIMESTAMP WITH TIME ZONE;
        RETURN;
    END IF;

    -- 문제 확인
    IF NOT EXISTS (
        SELECT 1 FROM central_questions 
        WHERE id = p_question_id AND is_active = true
    ) THEN
        RETURN QUERY SELECT FALSE, 'Question not found or inactive', NULL::TIMESTAMP WITH TIME ZONE;
        RETURN;
    END IF;

    -- 세션에 현재 문제 설정
    UPDATE score_steal_sessions 
    SET 
        current_question_id = p_question_id,
        question_broadcast_at = v_broadcast_time,
        input_locked = false,
        winner_team_id = NULL,
        winner_response_time_ms = NULL
    WHERE id = p_session_id;

    RETURN QUERY SELECT TRUE, 'Question broadcasted successfully', v_broadcast_time;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, NULL::TIMESTAMP WITH TIME ZONE;
END;
$$;

-- 실시간 답안 제출 함수 (경쟁 모드)
CREATE OR REPLACE FUNCTION submit_score_steal_answer_realtime(
    p_session_id UUID,
    p_team_id UUID,
    p_answer TEXT,
    p_broadcast_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    attempt_id UUID,
    is_correct BOOLEAN,
    is_winner BOOLEAN,
    response_time_ms INTEGER,
    input_should_lock BOOLEAN,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt_id UUID;
    v_session_record RECORD;
    v_question_record RECORD;
    v_is_correct BOOLEAN := FALSE;
    v_response_time INTEGER;
    v_is_winner BOOLEAN := FALSE;
    v_should_lock BOOLEAN := FALSE;
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM score_steal_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, FALSE, FALSE, 'Session not found or not active';
        RETURN;
    END IF;

    -- 입력이 이미 잠겨있는지 확인
    IF v_session_record.input_locked THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, TRUE, FALSE, 'Input is locked - question already answered';
        RETURN;
    END IF;

    -- 현재 문제 정보 조회
    SELECT * INTO v_question_record
    FROM central_questions 
    WHERE id = v_session_record.current_question_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, FALSE, FALSE, 'No active question';
        RETURN;
    END IF;

    -- 응답 시간 계산 (밀리초)
    v_response_time := EXTRACT(EPOCH FROM (NOW() - p_broadcast_time)) * 1000;

    -- 정답 확인 (대소문자 무시, 공백 제거)
    v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(v_question_record.correct_answer));

    -- 정답이고 아직 승자가 없다면 승자로 설정
    IF v_is_correct AND v_session_record.winner_team_id IS NULL THEN
        v_is_winner := TRUE;
        v_should_lock := TRUE;

        -- 세션에 승자 정보 업데이트 및 입력 잠금
        UPDATE score_steal_sessions 
        SET 
            winner_team_id = p_team_id,
            winner_response_time_ms = v_response_time,
            input_locked = TRUE
        WHERE id = p_session_id;
    END IF;

    -- 시도 기록 저장
    INSERT INTO score_steal_attempts (
        session_id,
        game_id,
        round_number,
        team_id,
        question_id,
        target_team_id, -- 나중에 관리자가 선택
        answer,
        is_correct,
        response_time_ms,
        is_winner,
        points_gained,
        points_lost
    ) VALUES (
        p_session_id,
        v_session_record.game_id,
        v_session_record.round_number,
        p_team_id,
        v_question_record.id,
        NULL, -- 아직 타겟 미선택
        p_answer,
        v_is_correct,
        v_response_time,
        v_is_winner,
        0, -- 아직 점수 미적용
        0
    ) RETURNING id INTO v_attempt_id;

    RETURN QUERY SELECT 
        v_attempt_id,
        v_is_correct,
        v_is_winner,
        v_response_time,
        v_should_lock,
        TRUE,
        CASE 
            WHEN v_is_winner THEN 'Correct! You are the winner!'
            WHEN v_is_correct THEN 'Correct, but someone else was faster'
            ELSE 'Incorrect answer'
        END;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, 0, FALSE, FALSE, SQLERRM;
END;
$$;

-- 점수 뺏기 실행 함수 (승자가 타겟 선택 후)
CREATE OR REPLACE FUNCTION execute_score_steal_with_target(
    p_session_id UUID,
    p_target_team_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    points_stolen INTEGER,
    winner_new_score INTEGER,
    target_new_score INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_record RECORD;
    v_question_record RECORD;
    v_winner_team RECORD;
    v_target_team RECORD;
    v_points_to_steal INTEGER;
    v_winner_new_score INTEGER;
    v_target_new_score INTEGER;
BEGIN
    -- 세션 정보 조회
    SELECT * INTO v_session_record
    FROM score_steal_sessions 
    WHERE id = p_session_id AND status = 'active' AND winner_team_id IS NOT NULL;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Session not found, not active, or no winner', 0, 0, 0;
        RETURN;
    END IF;

    -- 연속 방지 로직: 이전 승자와 같은 팀인지 확인
    IF v_session_record.last_winner_team_id = v_session_record.winner_team_id THEN
        RETURN QUERY SELECT FALSE, 'This team won the previous question. Another team must win first.', 0, 0, 0;
        RETURN;
    END IF;

    -- 자기 자신을 타겟으로 선택했는지 확인
    IF v_session_record.winner_team_id = p_target_team_id THEN
        RETURN QUERY SELECT FALSE, 'Cannot steal from your own team', 0, 0, 0;
        RETURN;
    END IF;

    -- 문제 정보 조회
    SELECT * INTO v_question_record
    FROM central_questions 
    WHERE id = v_session_record.current_question_id;

    -- 승자 팀 정보 조회
    SELECT * INTO v_winner_team
    FROM teams 
    WHERE id = v_session_record.winner_team_id;

    -- 타겟 팀 정보 조회
    SELECT * INTO v_target_team
    FROM teams 
    WHERE id = p_target_team_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Target team not found', 0, 0, 0;
        RETURN;
    END IF;

    -- 뺏을 점수 계산 (문제 점수 또는 타겟 팀 점수의 절반 중 작은 값)
    v_points_to_steal := LEAST(v_question_record.points, v_target_team.score / 2);
    v_points_to_steal := GREATEST(v_points_to_steal, 0); -- 음수 방지

    -- 점수 이동 (원자적 처리)
    UPDATE teams 
    SET score = score + v_points_to_steal
    WHERE id = v_session_record.winner_team_id
    RETURNING score INTO v_winner_new_score;

    UPDATE teams 
    SET score = GREATEST(score - v_points_to_steal, 0) -- 음수 방지
    WHERE id = p_target_team_id
    RETURNING score INTO v_target_new_score;

    -- 시도 기록 업데이트
    UPDATE score_steal_attempts 
    SET 
        target_team_id = p_target_team_id,
        points_gained = v_points_to_steal,
        points_lost = v_points_to_steal
    WHERE session_id = p_session_id 
        AND team_id = v_session_record.winner_team_id 
        AND is_winner = TRUE;

    -- 세션에 이전 승자 기록 (연속 방지용)
    UPDATE score_steal_sessions 
    SET last_winner_team_id = v_session_record.winner_team_id
    WHERE id = p_session_id;

    RETURN QUERY SELECT 
        TRUE, 
        'Score steal executed successfully', 
        v_points_to_steal,
        v_winner_new_score,
        v_target_new_score;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, 0, 0, 0;
END;
$$;

-- 점수 뺏기 라운드 종료 함수
CREATE OR REPLACE FUNCTION finish_score_steal_round(p_session_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    final_scores JSON
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_id UUID;
    v_final_scores JSON;
BEGIN
    -- 세션 정보 확인
    SELECT game_id INTO v_game_id
    FROM score_steal_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Session not found or already finished', NULL::JSON;
        RETURN;
    END IF;

    -- 세션 종료
    UPDATE score_steal_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE id = p_session_id;

    -- 최종 점수 JSON 생성
    SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'team_id', t.id,
            'team_name', t.team_name,
            'team_number', t.team_number,
            'final_score', t.score,
            'ranking', ROW_NUMBER() OVER (ORDER BY t.score DESC)
        )
    ) INTO v_final_scores
    FROM teams t
    WHERE t.game_id = v_game_id;

    RETURN QUERY SELECT TRUE, 'Score Steal round finished successfully', v_final_scores;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, NULL::JSON;
END;
$$;

-- 실시간 상태 조회 뷰 (관리자용)
CREATE OR REPLACE VIEW score_steal_admin_dashboard AS
SELECT 
    ssls.session_id,
    ssls.game_id,
    ssls.round_number,
    ssls.status,
    ssls.question_title,
    ssls.question_image_url,
    ssls.difficulty,
    ssls.points,
    ssls.question_broadcast_at,
    ssls.input_locked,
    ssls.winner_team_name,
    ssls.winner_response_time_ms,
    ssls.last_winner_team_name,
    COUNT(ssa.id) as total_attempts,
    COUNT(CASE WHEN ssa.is_correct THEN 1 END) as correct_attempts,
    JSON_AGG(
        CASE WHEN ssa.id IS NOT NULL THEN
            JSON_BUILD_OBJECT(
                'team_name', t.team_name,
                'answer', ssa.answer,
                'is_correct', ssa.is_correct,
                'response_time_ms', ssa.response_time_ms,
                'is_winner', ssa.is_winner,
                'submitted_at', ssa.submitted_at
            )
        END
        ORDER BY ssa.response_time_ms ASC
    ) FILTER (WHERE ssa.id IS NOT NULL) as attempts
FROM score_steal_live_session ssls
LEFT JOIN score_steal_attempts ssa ON ssls.session_id = ssa.session_id 
    AND ssls.current_question_id = ssa.question_id
LEFT JOIN teams t ON ssa.team_id = t.id
GROUP BY 
    ssls.session_id, ssls.game_id, ssls.round_number, ssls.status,
    ssls.question_title, ssls.question_image_url, ssls.difficulty, ssls.points,
    ssls.question_broadcast_at, ssls.input_locked, ssls.winner_team_name,
    ssls.winner_response_time_ms, ssls.last_winner_team_name;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_current_question ON score_steal_sessions(current_question_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_winner ON score_steal_sessions(winner_team_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_sessions_last_winner ON score_steal_sessions(last_winner_team_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_session ON score_steal_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_response_time ON score_steal_attempts(response_time_ms);
CREATE INDEX IF NOT EXISTS idx_score_steal_attempts_winner ON score_steal_attempts(is_winner);