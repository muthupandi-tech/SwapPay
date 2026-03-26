const mysql = require('mysql2/promise');

async function checkStatusType() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    const [rows] = await connection.execute('SHOW COLUMNS FROM swaps LIKE "status"');
    console.log("Status column type:", rows[0].Type);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkStatusType();
