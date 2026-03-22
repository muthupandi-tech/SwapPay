const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'mysqlpandi', database: 'swappay' });
  const [rows] = await pool.execute("SELECT id, user_id, status FROM swaps WHERE id = 84");
  console.log('Swap 84:', rows);
  process.exit();
}
run();
