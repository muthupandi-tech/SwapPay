require('dotenv').config();
const mysql = require('mysql2/promise');

async function addColumn() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'mysqlpandi',
            database: process.env.DB_NAME || 'swappay',
        });

        console.log("Attempting to add completed_at to swaps...");
        await pool.query("ALTER TABLE swaps ADD COLUMN completed_at DATETIME NULL;");
        console.log("Success.");
        process.exit(0);
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Column already exists.");
            process.exit(0);
        }
        console.error("Error:", e);
        process.exit(1);
    }
}
addColumn();
