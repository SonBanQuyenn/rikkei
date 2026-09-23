-- Tạo bảng
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    gpa NUMERIC(4,2)
);

-- Dữ liệu mẫu
INSERT INTO students (name, gpa) VALUES
('Nguyen Van A', 3.80),
('Tran Thi B', 3.20),
('Le Van C', 2.90),
('Pham Thi D', 3.50),
('Hoang Van E', 2.50),
('Do Thi F', 3.10);

WITH avg_gpa_all AS (
    SELECT AVG(gpa) AS avg_gpa
    FROM students
)
SELECT 
    s.name,
    s.gpa
FROM students s, avg_gpa_all a
WHERE s.gpa > a.avg_gpa
ORDER BY s.gpa DESC;