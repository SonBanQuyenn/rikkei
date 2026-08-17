exports.seed = async function(knex) {
  await knex('orders').del();
  await knex('users').del();
  
  const users = [
    { name: 'Nguyen Van A', email: 'a@example.com' },
    { name: 'Tran Thi B', email: 'b@example.com' },
    { name: 'Le Van C', email: 'c@example.com' },
    { name: 'Pham Thi D', email: 'd@example.com' },
    { name: 'Hoang Van E', email: 'e@example.com' }
  ];
  
  const userIds = await knex('users').insert(users);
  
  const orders = [
    { user_id: 1, total: 150000 },
    { user_id: 1, total: 200000 },
    { user_id: 1, total: 300000 },
    { user_id: 2, total: 450000 },
    { user_id: 2, total: 100000 },
    { user_id: 3, total: 600000 },
    { user_id: 3, total: 250000 },
    { user_id: 3, total: 120000 },
    { user_id: 3, total: 180000 },
    { user_id: 4, total: 350000 },
    { user_id: 4, total: 220000 },
    { user_id: 5, total: 500000 },
    { user_id: 5, total: 130000 },
    { user_id: 5, total: 210000 },
    { user_id: 5, total: 320000 }
  ];
  
  await knex('orders').insert(orders);
};