const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'mysqlpandi', database: 'swappay' });
  const [rows] = await pool.execute("SELECT id, name FROM users");
  console.log('Users:', rows);
  process.exit();
}
run();
