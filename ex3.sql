SELECT title FROM Books WHERE PublishedYear > 2020;

SELECT title FROM Books WHERE Author = 'Nguyen' OR title LIKE 'a%';

SELECT title FROM Books 
ORDER BY PublishedYear DESC, title ASC 
LIMIT 2;