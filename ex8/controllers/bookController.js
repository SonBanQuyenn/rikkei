const books = require('../data/books');
const AppError = require('../utils/AppError');

const getBooks = (req, res, next) => {
    try {
        const version = req.apiVersion;
        let formattedBooks;

        if (version === 'v1') {
            formattedBooks = books.map(book => ({
                id: book.id,
                title: book.title,
                author: book.author
            }));
        } else if (version === 'v2') {
            formattedBooks = books.map(book => ({
                id: book.id,
                title: book.title,
                author: {
                    id: book.id,
                    name: book.author
                },
                publishedYear: book.publishedYear
            }));
        } else {
            throw new AppError('Unsupported API version', 400, 'UNSUPPORTED_API_VERSION');
        }

        res.json({
            success: true,
            version: version,
            data: formattedBooks
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getBooks
};