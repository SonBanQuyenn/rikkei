-- Tạo bảng
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL
);

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    course_id INT REFERENCES courses(id),
    score NUMERIC(4,2) CHECK (score <= 10)
);

-- Dữ liệu mẫu
INSERT INTO courses (name) VALUES
('Lập trình Python'),
('Cơ sở dữ liệu');

INSERT INTO students (name) VALUES
('Nguyen Van A');

INSERT INTO enrollments (student_id, course_id, score) VALUES
(1, 1, 8.5);

SELECT * FROM enrollments;
BEGIN;

DELETE FROM enrollments
WHERE student_id = 1 AND course_id = 1;

SAVEPOINT after_delete;

INSERT INTO enrollments (student_id, course_id, score) VALUES
(1, 2, 15);

ROLLBACK TO SAVEPOINT after_delete;
ROLLBACK;
SELECT * FROM enrollments;