let comments = [];
let nextCommentId = 1;

const create = (data) => {
    const newComment = {
        id: nextCommentId++,
        postId: data.postId,
        content: data.content
    };
    comments.push(newComment);
    return newComment;
};

const findAllByPostId = (postId) => {
    return comments.filter(comment => comment.postId === postId);
};

const deleteByPostId = (postId) => {
    const initialLength = comments.length;
    comments = comments.filter(comment => comment.postId !== postId);
    return comments.length < initialLength;
};

module.exports = {
    create,
    findAllByPostId,
    deleteByPostId
};