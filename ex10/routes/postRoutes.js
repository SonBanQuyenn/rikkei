const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const upload = require('../middlewares/upload');
const { authenticate, authorize } = require('../middlewares/auth');

router.get('/', postController.getPosts);
router.get('/:id', postController.getPostById);
router.post('/', upload.single('thumbnail'), postController.createPost);
router.delete('/:id', authenticate, authorize('admin'), postController.deletePost);

module.exports = router;