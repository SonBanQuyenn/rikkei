-- Tạo bảng
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150)
);

-- Giả lập dữ liệu lớn
INSERT INTO students (name, email)
SELECT 
    'Student ' || i,
    'student' || i || '@example.com'
FROM generate_series(1, 1000000) AS i;

EXPLAIN ANALYZE
SELECT * FROM students WHERE email = 'student500000@example.com';

CREATE UNIQUE INDEX idx_students_email ON students(email);

EXPLAIN ANALYZE
SELECT * FROM students WHERE email = 'student500000@example.com';