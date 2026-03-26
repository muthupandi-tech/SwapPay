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
        console.log("Migrating users table for smart notifications...");
        
        const alterQuery = `
            ALTER TABLE users 
            ADD COLUMN last_notified_at DATETIME NULL,
            ADD COLUMN last_best_match_score FLOAT DEFAULT 0
        `;
        
        await promisePool.execute(alterQuery);
        console.log("Migration successful: Added last_notified_at and last_best_match_score columns.");
        process.exit(0);
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log("Columns already exist, skipping migration.");
            process.exit(0);
        } else {
            console.error("Migration failed:", err);
            process.exit(1);
        }
    }
}

migrate();
