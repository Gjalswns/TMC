-- ============================================================
-- 중앙집중식 문제 관리 시스템
-- ============================================================
-- 모든 게임에서 공통으로 사용할 문제들을 관리하는 테이블들
-- 이미지 기반 문제 업로드 지원
-- ============================================================

-- 문제 카테고리 테이블
CREATE TABLE IF NOT EXISTS question_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE, -- 'score_steal', 'relay_p', 'relay_q', 'relay_r', 'relay_s'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 중앙 문제 테이블 (이미지 기반)
CREATE TABLE IF NOT EXISTS central_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES question_categories(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    question_image_url TEXT NOT NULL, -- 문제 이미지 URL
    correct_answer TEXT NOT NULL,
    difficulty VARCHAR(10) CHECK (difficulty IN ('easy', 'medium', 'hard')),
    points INTEGER DEFAULT 10,
    order_index INTEGER DEFAULT 0, -- 릴레이 퀴즈에서 순서 (1,2,3,4)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 게임별 문제 할당 테이블 (게임 생성시 문제 할당)
CREATE TABLE IF NOT EXISTS game_question_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    question_id UUID REFERENCES central_questions(id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL, -- 'score_steal', 'relay_quiz'
    round_number INTEGER, -- 릴레이 퀴즈의 경우 라운드 번호 (3 또는 4)
    question_order INTEGER, -- 릴레이 퀴즈의 경우 문제 순서 (1,2,3,4)
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, game_type, round_number, question_order)
);

-- 기본 카테고리 데이터 삽입
INSERT INTO question_categories (name, description) VALUES
('score_steal', '점수 뺏기 게임 문제'),
('relay_p', '릴레이 퀴즈 P 세트 문제'),
('relay_q', '릴레이 퀴즈 Q 세트 문제'),
('relay_r', '릴레이 퀴즈 R 세트 문제'),
('relay_s', '릴레이 퀴즈 S 세트 문제')
ON CONFLICT (name) DO NOTHING;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_central_questions_category ON central_questions(category_id);
CREATE INDEX IF NOT EXISTS idx_central_questions_difficulty ON central_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_central_questions_active ON central_questions(is_active);
CREATE INDEX IF NOT EXISTS idx_central_questions_order ON central_questions(order_index);
CREATE INDEX IF NOT EXISTS idx_game_question_assignments_game ON game_question_assignments(game_id);
CREATE INDEX IF NOT EXISTS idx_game_question_assignments_type ON game_question_assignments(game_type);
CREATE INDEX IF NOT EXISTS idx_game_question_assignments_round ON game_question_assignments(round_number);

-- RLS 정책 설정
ALTER TABLE question_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_question_assignments ENABLE ROW LEVEL SECURITY;

-- 모든 작업 허용 정책 (추후 세분화 가능)
CREATE POLICY "Allow all operations on question_categories" ON question_categories FOR ALL USING (true);
CREATE POLICY "Allow all operations on central_questions" ON central_questions FOR ALL USING (true);
CREATE POLICY "Allow all operations on game_question_assignments" ON game_question_assignments FOR ALL USING (true);

-- 문제 관리를 위한 함수들
-- ============================================================

-- 카테고리별 문제 조회 함수
CREATE OR REPLACE FUNCTION get_questions_by_category(category_name TEXT)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    question_image_url TEXT,
    correct_answer TEXT,
    difficulty VARCHAR(10),
    points INTEGER,
    order_index INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
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
        cq.order_index,
        cq.created_at
    FROM central_questions cq
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE qc.name = category_name AND cq.is_active = true
    ORDER BY cq.order_index, cq.created_at;
END;
$$;

-- 게임에 문제 할당 함수
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
    -- 점수 뺏기 게임 문제 할당 (랜덤하게 선택)
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

    -- 릴레이 퀴즈 문제 할당 (P, Q, R, S 세트별로)
    FOR category_record IN 
        SELECT id, name FROM question_categories 
        WHERE name IN ('relay_p', 'relay_q', 'relay_r', 'relay_s')
    LOOP
        assignment_count := 0;
        
        -- 각 세트에서 순서대로 문제 할당
        FOR question_record IN
            SELECT id, order_index
            FROM central_questions 
            WHERE category_id = category_record.id AND is_active = true
            ORDER BY order_index
            LIMIT p_relay_questions_per_set
        LOOP
            assignment_count := assignment_count + 1;
            
            -- 라운드 3과 4에 모두 할당 (순환 구조)
            INSERT INTO game_question_assignments (
                game_id, 
                question_id, 
                game_type, 
                round_number, 
                question_order
            ) VALUES (
                p_game_id,
                question_record.id,
                'relay_quiz',
                3, -- 라운드 3
                assignment_count
            );
            
            INSERT INTO game_question_assignments (
                game_id, 
                question_id, 
                game_type, 
                round_number, 
                question_order
            ) VALUES (
                p_game_id,
                question_record.id,
                'relay_quiz',
                4, -- 라운드 4
                assignment_count
            );
        END LOOP;
    END LOOP;

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- 게임의 할당된 문제 조회 함수
CREATE OR REPLACE FUNCTION get_game_questions(
    p_game_id UUID,
    p_game_type TEXT,
    p_round_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
    assignment_id UUID,
    question_id UUID,
    title VARCHAR(255),
    question_image_url TEXT,
    correct_answer TEXT,
    difficulty VARCHAR(10),
    points INTEGER,
    question_order INTEGER,
    category_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gqa.id as assignment_id,
        cq.id as question_id,
        cq.title,
        cq.question_image_url,
        cq.correct_answer,
        cq.difficulty,
        cq.points,
        gqa.question_order,
        qc.name as category_name
    FROM game_question_assignments gqa
    JOIN central_questions cq ON gqa.question_id = cq.id
    JOIN question_categories qc ON cq.category_id = qc.id
    WHERE gqa.game_id = p_game_id 
        AND gqa.game_type = p_game_type
        AND (p_round_number IS NULL OR gqa.round_number = p_round_number)
    ORDER BY gqa.question_order, cq.order_index;
END;
$$;

-- 문제 업로드 트리거 (updated_at 자동 업데이트)
CREATE OR REPLACE FUNCTION update_question_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_question_updated_at
    BEFORE UPDATE ON central_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_question_updated_at();

-- 샘플 데이터 (테스트용)
-- ============================================================

-- 점수 뺏기 게임 샘플 문제
INSERT INTO central_questions (category_id, title, question_image_url, correct_answer, difficulty, points) 
SELECT 
    qc.id,
    '수학 문제 ' || generate_series,
    'https://via.placeholder.com/400x300/4F46E5/FFFFFF?text=Question+' || generate_series,
    (generate_series * 2)::TEXT,
    CASE 
        WHEN generate_series % 3 = 1 THEN 'easy'
        WHEN generate_series % 3 = 2 THEN 'medium'
        ELSE 'hard'
    END,
    CASE 
        WHEN generate_series % 3 = 1 THEN 10
        WHEN generate_series % 3 = 2 THEN 20
        ELSE 30
    END
FROM question_categories qc, generate_series(1, 15)
WHERE qc.name = 'score_steal';

-- 릴레이 퀴즈 P 세트 샘플 문제
INSERT INTO central_questions (category_id, title, question_image_url, correct_answer, difficulty, points, order_index) 
SELECT 
    qc.id,
    'P세트 문제 ' || generate_series,
    'https://via.placeholder.com/400x300/059669/FFFFFF?text=P+Set+Q' || generate_series,
    (generate_series + 10)::TEXT,
    'medium',
    15,
    generate_series
FROM question_categories qc, generate_series(1, 4)
WHERE qc.name = 'relay_p';

-- 릴레이 퀴즈 Q 세트 샘플 문제
INSERT INTO central_questions (category_id, title, question_image_url, correct_answer, difficulty, points, order_index) 
SELECT 
    qc.id,
    'Q세트 문제 ' || generate_series,
    'https://via.placeholder.com/400x300/DC2626/FFFFFF?text=Q+Set+Q' || generate_series,
    (generate_series + 20)::TEXT,
    'medium',
    15,
    generate_series
FROM question_categories qc, generate_series(1, 4)
WHERE qc.name = 'relay_q';

-- 릴레이 퀴즈 R 세트 샘플 문제
INSERT INTO central_questions (category_id, title, question_image_url, correct_answer, difficulty, points, order_index) 
SELECT 
    qc.id,
    'R세트 문제 ' || generate_series,
    'https://via.placeholder.com/400x300/7C2D12/FFFFFF?text=R+Set+Q' || generate_series,
    (generate_series + 30)::TEXT,
    'medium',
    15,
    generate_series
FROM question_categories qc, generate_series(1, 4)
WHERE qc.name = 'relay_r';

-- 릴레이 퀴즈 S 세트 샘플 문제
INSERT INTO central_questions (category_id, title, question_image_url, correct_answer, difficulty, points, order_index) 
SELECT 
    qc.id,
    'S세트 문제 ' || generate_series,
    'https://via.placeholder.com/400x300/7C3AED/FFFFFF?text=S+Set+Q' || generate_series,
    (generate_series + 40)::TEXT,
    'medium',
    15,
    generate_series
FROM question_categories qc, generate_series(1, 4)
WHERE qc.name = 'relay_s';
