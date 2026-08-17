const knex = require('knex');
const config = require('./knexfile');

const db = knex(config.development);

const query = db('users')
  .leftJoin('orders', 'users.id', 'orders.user_id')
  .select(
    'users.name',
    knex.raw('COUNT(orders.id) as order_count'),
    knex.raw('SUM(orders.total) as total_spent')
  )
  .groupBy('users.id', 'users.name')
  .havingRaw('COUNT(orders.id) >= 2')
  .orderBy('total_spent', 'desc')
  .limit(3);

console.log('SQL Query:');
console.log(query.toString());
console.log('\n');

query.then((results) => {
  console.log('Results:');
  console.table(results);
  console.log('\n');
  
  console.log('Top 3 users by spending:');
  results.forEach((row, index) => {
    console.log(`${index + 1}. ${row.name}`);
    console.log(`   Orders: ${row.order_count}`);
    console.log(`   Total spent: ${row.total_spent.toLocaleString()} VND`);
    console.log('');
  });
  
  process.exit(0);
}).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});