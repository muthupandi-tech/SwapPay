const mysql = require('mysql2/promise');

async function findMatchedSwap() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    const [rows] = await connection.execute('SELECT id, user_id, matched_user_id FROM swaps WHERE status = "matched" LIMIT 1');
    console.log(JSON.stringify(rows[0]));
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

findMatchedSwap();
