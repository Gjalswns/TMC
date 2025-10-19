-- ============================================================
-- Year Game 팀 단위 수정
-- ============================================================
-- 개인별 -> 팀별 점수 시스템으로 변경
-- 1~100 숫자 만들기로 확장
-- ============================================================

-- Year Game 세션 테이블 수정 (1~100 범위로 확장)
ALTER TABLE year_game_sessions 
ADD COLUMN IF NOT EXISTS target_range_start INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS target_range_end INTEGER DEFAULT 100;

-- 기존 세션들 업데이트
UPDATE year_game_sessions 
SET target_range_start = 1, target_range_end = 100 
WHERE target_range_start IS NULL;

-- Year Game 팀 결과 테이블 수정
ALTER TABLE year_game_results
ADD COLUMN IF NOT EXISTS numbers_found_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_percentage DECIMAL(5,2) DEFAULT 0.00;

-- 팀별 Year Game 진행 상황을 실시간으로 추적하는 뷰
CREATE OR REPLACE VIEW year_game_team_progress AS
SELECT 
    ygr.session_id,
    ygr.team_id,
    t.team_name,
    t.team_number,
    ygr.numbers_found,
    ygr.total_found,
    ygr.score,
    ygr.numbers_found_count,
    ygr.completion_percentage,
    ygs.target_range_start,
    ygs.target_range_end,
    (ygs.target_range_end - ygs.target_range_start + 1) as total_possible_numbers,
    ROUND((ygr.total_found::DECIMAL / (ygs.target_range_end - ygs.target_range_start + 1)) * 100, 2) as progress_percentage,
    ygr.updated_at as last_updated
FROM year_game_results ygr
JOIN teams t ON ygr.team_id = t.id
JOIN year_game_sessions ygs ON ygr.session_id = ygs.id
ORDER BY ygr.total_found DESC, ygr.score DESC;

-- Year Game 시도 기록 개선 (팀원 정보 포함)
CREATE OR REPLACE VIEW year_game_attempts_with_details AS
SELECT 
    yga.id,
    yga.session_id,
    yga.team_id,
    t.team_name,
    yga.participant_id,
    p.nickname as participant_name,
    yga.expression,
    yga.target_number,
    yga.is_valid,
    yga.is_correct,
    yga.is_duplicate,
    yga.submitted_at,
    CASE 
        WHEN yga.is_correct AND NOT yga.is_duplicate THEN '✅ 새로운 정답'
        WHEN yga.is_correct AND yga.is_duplicate THEN '🔄 중복 정답'
        WHEN NOT yga.is_valid THEN '❌ 잘못된 식'
        ELSE '❌ 오답'
    END as status_display
FROM year_game_attempts yga
JOIN teams t ON yga.team_id = t.id
JOIN participants p ON yga.participant_id = p.id
ORDER BY yga.submitted_at DESC;

-- 팀별 Year Game 통계 함수
CREATE OR REPLACE FUNCTION get_year_game_team_stats(p_session_id UUID, p_team_id UUID)
RETURNS TABLE (
    team_id UUID,
    team_name VARCHAR(100),
    numbers_found INTEGER[],
    total_found INTEGER,
    score INTEGER,
    progress_percentage DECIMAL(5,2),
    recent_attempts JSON,
    team_ranking INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH team_stats AS (
        SELECT 
            ygtp.team_id,
            ygtp.team_name,
            ygtp.numbers_found,
            ygtp.total_found,
            ygtp.score,
            ygtp.progress_percentage,
            ROW_NUMBER() OVER (ORDER BY ygtp.total_found DESC, ygtp.score DESC) as ranking
        FROM year_game_team_progress ygtp
        WHERE ygtp.session_id = p_session_id
    ),
    recent_attempts AS (
        SELECT 
            yga.team_id,
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'expression', yga.expression,
                    'target_number', yga.target_number,
                    'is_correct', yga.is_correct,
                    'is_duplicate', yga.is_duplicate,
                    'participant_name', yga.participant_name,
                    'submitted_at', yga.submitted_at,
                    'status_display', yga.status_display
                ) ORDER BY yga.submitted_at DESC
            ) as attempts
        FROM year_game_attempts_with_details yga
        WHERE yga.session_id = p_session_id
        GROUP BY yga.team_id
    )
    SELECT 
        ts.team_id,
        ts.team_name,
        ts.numbers_found,
        ts.total_found,
        ts.score,
        ts.progress_percentage,
        COALESCE(ra.attempts, '[]'::JSON) as recent_attempts,
        ts.ranking::INTEGER as team_ranking
    FROM team_stats ts
    LEFT JOIN recent_attempts ra ON ts.team_id = ra.team_id
    WHERE ts.team_id = p_team_id OR p_team_id IS NULL
    ORDER BY ts.ranking;
END;
$$;

-- Year Game 세션 시작 함수 (1~100 범위)
CREATE OR REPLACE FUNCTION start_year_game_session(
    p_game_id UUID,
    p_round_number INTEGER DEFAULT 1,
    p_time_limit_seconds INTEGER DEFAULT 600, -- 10분
    p_target_numbers INTEGER[] DEFAULT ARRAY[3, 7, 12, 25] -- 기본 숫자들
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
    UPDATE year_game_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE game_id = p_game_id AND status = 'active';

    -- 새 세션 생성
    INSERT INTO year_game_sessions (
        game_id, 
        round_number, 
        target_numbers, 
        time_limit_seconds,
        target_range_start,
        target_range_end,
        status, 
        started_at
    ) VALUES (
        p_game_id, 
        p_round_number, 
        p_target_numbers, 
        p_time_limit_seconds,
        1, -- 1부터
        100, -- 100까지
        'active', 
        NOW()
    ) RETURNING id INTO v_session_id;

    -- 모든 팀에 대해 결과 테이블 초기화
    FOR v_team_record IN 
        SELECT id, team_name FROM teams WHERE game_id = p_game_id
    LOOP
        INSERT INTO year_game_results (
            session_id, 
            team_id, 
            numbers_found, 
            total_found, 
            score,
            numbers_found_count,
            completion_percentage
        ) VALUES (
            v_session_id, 
            v_team_record.id, 
            ARRAY[]::INTEGER[], 
            0, 
            0,
            0,
            0.00
        );
    END LOOP;

    RETURN QUERY SELECT v_session_id, TRUE, 'Year Game session started successfully';

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, SQLERRM;
END;
$$;

-- Year Game 시도 제출 함수 (팀 단위)
CREATE OR REPLACE FUNCTION submit_year_game_team_attempt(
    p_session_id UUID,
    p_team_id UUID,
    p_participant_id UUID,
    p_expression TEXT,
    p_target_number INTEGER
)
RETURNS TABLE (
    attempt_id UUID,
    is_valid BOOLEAN,
    is_correct BOOLEAN,
    is_duplicate BOOLEAN,
    is_new_number BOOLEAN,
    team_score INTEGER,
    team_total_found INTEGER,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt_id UUID;
    v_is_valid BOOLEAN := FALSE;
    v_is_correct BOOLEAN := FALSE;
    v_is_duplicate BOOLEAN := FALSE;
    v_is_new_number BOOLEAN := FALSE;
    v_session_record RECORD;
    v_current_numbers INTEGER[];
    v_new_score INTEGER;
    v_new_total INTEGER;
BEGIN
    -- 세션 정보 확인
    SELECT * INTO v_session_record
    FROM year_game_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, FALSE, FALSE, 0, 0, FALSE, 'Session not found or not active';
        RETURN;
    END IF;

    -- 시간 제한 확인
    IF NOW() > v_session_record.started_at + (v_session_record.time_limit_seconds || ' seconds')::INTERVAL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, FALSE, FALSE, 0, 0, FALSE, 'Time limit exceeded';
        RETURN;
    END IF;

    -- 숫자 범위 확인 (1~100)
    IF p_target_number < 1 OR p_target_number > 100 THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, FALSE, FALSE, 0, 0, FALSE, 'Target number must be between 1 and 100';
        RETURN;
    END IF;

    -- 표현식 유효성 검사 (간단한 검사)
    v_is_valid := LENGTH(p_expression) > 0 AND p_expression ~ '^[0-9+\-*/^()pPcC\s]+$';
    
    -- 정답 여부 확인 (실제로는 더 정교한 수식 계산 필요)
    v_is_correct := v_is_valid; -- 임시로 유효하면 정답으로 처리

    -- 현재 팀이 찾은 숫자들 확인
    SELECT numbers_found INTO v_current_numbers
    FROM year_game_results 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    -- 중복 확인
    v_is_duplicate := p_target_number = ANY(v_current_numbers);
    v_is_new_number := v_is_correct AND NOT v_is_duplicate;

    -- 시도 기록 저장
    INSERT INTO year_game_attempts (
        session_id, 
        team_id, 
        participant_id, 
        expression, 
        target_number, 
        is_valid, 
        is_correct, 
        is_duplicate
    ) VALUES (
        p_session_id, 
        p_team_id, 
        p_participant_id, 
        p_expression, 
        p_target_number, 
        v_is_valid, 
        v_is_correct, 
        v_is_duplicate
    ) RETURNING id INTO v_attempt_id;

    -- 새로운 정답인 경우 팀 결과 업데이트
    IF v_is_new_number THEN
        UPDATE year_game_results 
        SET 
            numbers_found = array_append(numbers_found, p_target_number),
            total_found = total_found + 1,
            score = score + p_target_number,
            numbers_found_count = numbers_found_count + 1,
            completion_percentage = ROUND(((total_found + 1)::DECIMAL / 100) * 100, 2),
            updated_at = NOW()
        WHERE session_id = p_session_id AND team_id = p_team_id;
    END IF;

    -- 업데이트된 팀 정보 조회
    SELECT score, total_found INTO v_new_score, v_new_total
    FROM year_game_results 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    RETURN QUERY SELECT 
        v_attempt_id,
        v_is_valid,
        v_is_correct,
        v_is_duplicate,
        v_is_new_number,
        COALESCE(v_new_score, 0),
        COALESCE(v_new_total, 0),
        TRUE,
        CASE 
            WHEN v_is_new_number THEN 'New number found!'
            WHEN v_is_duplicate THEN 'Number already found by your team'
            WHEN NOT v_is_valid THEN 'Invalid expression'
            WHEN NOT v_is_correct THEN 'Incorrect calculation'
            ELSE 'Attempt recorded'
        END;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, FALSE, FALSE, FALSE, 0, 0, FALSE, SQLERRM;
END;
$$;

-- Year Game 세션 종료 및 점수 합산 함수
CREATE OR REPLACE FUNCTION finish_year_game_session(p_session_id UUID)
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
    FROM year_game_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Session not found or already finished', NULL::JSON;
        RETURN;
    END IF;

    -- 세션 종료
    UPDATE year_game_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE id = p_session_id;

    -- 각 팀의 Year Game 점수를 메인 점수에 합산
    FOR v_team_record IN
        SELECT ygr.team_id, ygr.score as year_game_score
        FROM year_game_results ygr
        WHERE ygr.session_id = p_session_id
    LOOP
        UPDATE teams 
        SET score = score + v_team_record.year_game_score
        WHERE id = v_team_record.team_id;
    END LOOP;

    -- 최종 결과 JSON 생성
    SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'team_id', ygtp.team_id,
            'team_name', ygtp.team_name,
            'numbers_found', ygtp.total_found,
            'year_game_score', ygtp.score,
            'progress_percentage', ygtp.progress_percentage,
            'ranking', ROW_NUMBER() OVER (ORDER BY ygtp.total_found DESC, ygtp.score DESC)
        )
    ) INTO v_final_scores
    FROM year_game_team_progress ygtp
    WHERE ygtp.session_id = p_session_id;

    RETURN QUERY SELECT TRUE, 'Year Game session finished successfully', v_final_scores;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM, NULL::JSON;
END;
$$;

-- 실시간 리더보드 뷰
CREATE OR REPLACE VIEW year_game_live_leaderboard AS
SELECT 
    ygs.id as session_id,
    ygs.game_id,
    ygtp.team_id,
    ygtp.team_name,
    ygtp.team_number,
    ygtp.total_found,
    ygtp.score as year_game_score,
    ygtp.progress_percentage,
    ygtp.numbers_found,
    ROW_NUMBER() OVER (
        PARTITION BY ygs.id 
        ORDER BY ygtp.total_found DESC, ygtp.score DESC, ygtp.last_updated ASC
    ) as current_rank,
    ygs.status as session_status,
    ygs.started_at,
    ygs.time_limit_seconds,
    CASE 
        WHEN ygs.status = 'active' THEN
            GREATEST(0, ygs.time_limit_seconds - EXTRACT(EPOCH FROM (NOW() - ygs.started_at))::INTEGER)
        ELSE 0
    END as remaining_seconds
FROM year_game_sessions ygs
JOIN year_game_team_progress ygtp ON ygs.id = ygtp.session_id
WHERE ygs.status IN ('active', 'finished')
ORDER BY ygs.started_at DESC, current_rank;