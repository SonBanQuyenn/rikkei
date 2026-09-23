-- Tạo bảng
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL
);

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE
);

CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(id),
    student_id INT REFERENCES students(id),
    score NUMERIC(4,2)
);

-- Dữ liệu mẫu
INSERT INTO courses (name) VALUES
('Lập trình NestJS'),
('Cơ sở dữ liệu'),
('Lập trình Web'),
('Trí tuệ nhân tạo');

INSERT INTO students (name, email) VALUES
('Nguyen Van A', 'a@example.com'),
('Tran Thi B', 'b@example.com'),
('Le Van C', 'c@example.com'),
('Pham Thi D', 'd@example.com'),
('Hoang Van E', 'e@example.com');

INSERT INTO enrollments (course_id, student_id, score) VALUES
(1, 1, 8.5),
(1, 2, 7.0),
(1, 3, 9.0),
(2, 1, 7.5),
(2, 4, 8.0),
(3, 2, 6.5),
(3, 3, 8.5),
(3, 5, 7.0),
(4, 1, 9.5),
(4, 5, 8.0);

SELECT 
    c.name AS "Tên khóa học",
    COUNT(e.student_id) AS "Số lượng sinh viên đã đăng ký",
    ROUND(AVG(e.score)::numeric, 2) AS "Điểm trung bình"
FROM courses c
JOIN enrollments e ON e.course_id = c.id
JOIN students s ON s.id = e.student_id
GROUP BY c.id, c.name
ORDER BY "Điểm trung bình" DESC;