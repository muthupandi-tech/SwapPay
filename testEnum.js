const mysql = require('mysql2/promise');
const fs = require('fs');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'mysqlpandi', database: 'swappay' });
  const [rows] = await pool.execute("SHOW COLUMNS FROM swaps LIKE 'status'");
  fs.writeFileSync('cleanEnum.txt', rows[0].Type, 'utf8');
  process.exit();
}
run();
