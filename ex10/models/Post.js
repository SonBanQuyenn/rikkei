let posts = [];
let nextPostId = 1;

const getAll = () => {
    return posts;
};

const findById = (id) => {
    return posts.find(post => post.id === id);
};

const create = (data) => {
    const newPost = {
        id: nextPostId++,
        title: data.title,
        content: data.content,
        thumbnailUrl: data.thumbnailUrl || null
    };
    posts.push(newPost);
    return newPost;
};

const deleteById = (id) => {
    const index = posts.findIndex(post => post.id === id);
    if (index === -1) return false;
    posts.splice(index, 1);
    return true;
};

module.exports = {
    getAll,
    findById,
    create,
    deleteById
};