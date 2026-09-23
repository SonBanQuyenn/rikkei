-- Tạo bảng
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- Thêm cột extra_info kiểu JSONB
ALTER TABLE students ADD COLUMN extra_info JSONB;

-- Dữ liệu mẫu ban đầu
INSERT INTO students (name) VALUES
('Nguyen Van A'),
('Tran Thi B'),
('Le Van C');

UPDATE students
SET extra_info = '{"skills": ["Giao tiếp", "Làm việc nhóm"], "toeic": 750}'
WHERE id = 1;

UPDATE students
SET extra_info = '{"skills": ["Python", "SQL"], "toeic": 650}'
WHERE id = 2;

SELECT 
    id,
    name,
    extra_info->>'toeic' AS toeic,
    extra_info->'skills' AS skills
FROM students
WHERE (extra_info->>'toeic')::int >= 700;