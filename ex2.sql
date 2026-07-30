INSERT INTO Books (Title, Author, PublishedYear) VALUES
('aff', 'Nguyen', 2006),
('bff', 'Tung', 2010),
('cff', 'Son', 2026);

UPDATE Books SET PublishedYear = 2007 WHERE BookID = 1;

DELETE FROM Books WHERE BookID = 2;

SELECT * FROM Books;