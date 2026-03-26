const mysql = require('mysql2');
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const promisePool = pool.promise();

async function migrate() {
    try {
        console.log("Starting migration: Adding auto_match column to users table...");
        const [result] = await promisePool.execute("ALTER TABLE users ADD COLUMN auto_match BOOLEAN DEFAULT TRUE");
        console.log("Migration successful:", result);
        process.exit(0);
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log("Column 'auto_match' already exists. Skipping migration.");
            process.exit(0);
        }
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
