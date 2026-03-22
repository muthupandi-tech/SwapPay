const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'mysqlpandi', database: 'swappay' });
  try {
     const [rows] = await pool.execute('SELECT id, status, completed_by FROM swaps WHERE id = 82');
     console.log('SWAP 82:', rows[0]);
  } catch(e) { console.error('err', e); }
  process.exit(0);
}
run();
