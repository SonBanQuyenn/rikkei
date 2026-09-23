-- Tạo bảng
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    dept_id INT REFERENCES departments(id),
    gpa NUMERIC(4,2)
);

-- Dữ liệu mẫu
INSERT INTO departments (name) VALUES
('CNTT'),
('Kinh tế'),
('Ngoại ngữ');

INSERT INTO students (name, dept_id, gpa) VALUES
('Nguyen Van A', 1, 3.80),
('Tran Thi B', 1, 3.50),
('Le Van C', 1, 3.20),
('Pham Thi D', 1, 3.80),
('Hoang Van E', 2, 3.60),
('Do Thi F', 2, 3.90),
('Vu Van G', 2, 3.10),
('Ngo Thi H', 3, 3.70),
('Dang Van I', 3, 3.40);

SELECT 
    s.name AS "Sinh viên",
    d.name AS "Phòng ban",
    s.gpa AS "GPA",
    RANK() OVER (PARTITION BY s.dept_id ORDER BY s.gpa DESC) AS "Thứ hạng trong phòng ban"
FROM students s
JOIN departments d ON d.id = s.dept_id
ORDER BY d.name, "Thứ hạng trong phòng ban";