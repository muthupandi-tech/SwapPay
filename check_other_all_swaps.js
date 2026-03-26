const mysql = require('mysql2/promise');

async function checkOtherSwaps() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    const [rows] = await connection.execute('SELECT id, user_id, amount, type, status FROM swaps WHERE user_id != 2 AND status IN ("active", "open")');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkOtherSwaps();
