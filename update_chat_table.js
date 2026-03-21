const mysql = require('mysql2/promise');

async function migrate() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay',
    });

    try {
        console.log('Adding status column to chat_messages table...');
        await pool.execute("ALTER TABLE chat_messages ADD COLUMN status ENUM('sent', 'delivered', 'seen') DEFAULT 'sent'");
        console.log('Migration successful!');
    } catch (error) {
        if (error.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Column "status" already exists.');
        } else {
            console.error('Migration failed:', error);
        }
    } finally {
        await pool.end();
    }
}

migrate();
