const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'mysqlpandi', database: 'swappay' });
  const [rows] = await pool.execute("SELECT status FROM swaps WHERE id = 85");
  console.log('Swap 85 Status:', rows[0].status);
  process.exit();
}
run();
