const Post = require('../models/Post');
const Comment = require('../models/Comment');
const AppError = require('../utils/AppError');

const getPosts = (req, res, next) => {
    try {
        const posts = Post.getAll();
        res.json({
            success: true,
            data: posts
        });
    } catch (error) {
        next(error);
    }
};

const getPostById = (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const post = Post.findById(id);

        if (!post) {
            throw new AppError('Không tìm thấy bài viết', 404);
        }

        const comments = Comment.findAllByPostId(id);

        res.json({
            success: true,
            data: {
                ...post,
                comments: comments
            }
        });
    } catch (error) {
        next(error);
    }
};

const createPost = (req, res, next) => {
    try {
        const { title, content } = req.body;

        if (!title || !content) {
            throw new AppError('Vui lòng cung cấp đầy đủ title và content', 400);
        }

        const thumbnailUrl = req.file ? req.file.filename : null;

        const newPost = Post.create({
            title,
            content,
            thumbnailUrl
        });

        res.status(201).json({
            success: true,
            data: newPost
        });
    } catch (error) {
        next(error);
    }
};

const deletePost = (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const post = Post.findById(id);

        if (!post) {
            throw new AppError('Không tìm thấy bài viết', 404);
        }

        Comment.deleteByPostId(id);
        Post.deleteById(id);

        res.json({
            success: true,
            message: 'Xóa bài viết thành công'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPosts,
    getPostById,
    createPost,
    deletePost
};