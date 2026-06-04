import { fetchUsers } from "./apiService.js";

const userContainer = document.getElementById("user-container");

function renderUserList(users) {
    if (!users || users.length === 0) {
        userContainer.innerHTML =
            '<p>Không có dữ liệu người dùng</p>';
        return;
    }

    const userCards = users
        .map(({ name, email, website }) => {
            return `
                <h3> Name: ${name}</h3>
                <p> Email: ${email}</p>
                <p> Website: <a href="https://${website}" target="_blank">${website}</a></p>
        `;
        })
        .join("");

    userContainer.innerHTML = userCards;
}

function showError(message) {
    userContainer.innerHTML = `<p>Lỗi: ${message}</p>`;
}

async function init() {
    try {
        const users = await fetchUsers();
        renderUserList(users);
        console.log("Đã tải thành công", users.length, "người dùng");
    } catch (error) {
        showError(error.message);
        console.error("Không thể tải dữ liệu:", error);
    }
}

init();
