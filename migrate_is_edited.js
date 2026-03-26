const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    console.log("Adding is_edited column to swaps table...");
    await connection.execute('ALTER TABLE swaps ADD COLUMN is_edited BOOLEAN DEFAULT FALSE');
    console.log("Migration successful!");
  } catch (err) {
    if (err.code === 'ER_DUP_COLUMN_NAME') {
      console.log("Column is_edited already exists.");
    } else {
      console.error("Migration failed:", err);
    }
  } finally {
    await connection.end();
  }
}

migrate();
