const Comment = require('../models/Comment');
const Post = require('../models/Post');
const AppError = require('../utils/AppError');

const createComment = (req, res, next) => {
    try {
        const { postId, content } = req.body;

        if (!postId || !content) {
            throw new AppError('Vui lòng cung cấp đầy đủ postId và content', 400);
        }

        const post = Post.findById(postId);
        if (!post) {
            throw new AppError('Không tìm thấy bài viết', 404);
        }

        const newComment = Comment.create({
            postId,
            content
        });

        res.status(201).json({
            success: true,
            data: newComment
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createComment
};