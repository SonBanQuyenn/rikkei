const API_URL = "https://jsonplaceholder.typicode.com/users";

async function fetchUsers() {
    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const users = await response.json();
        return users;
    } catch (error) {
        console.error("Failed to fetch users:", error);
        throw error;
    }
}

export { fetchUsers };
