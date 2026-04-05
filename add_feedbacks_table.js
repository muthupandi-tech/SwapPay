require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'mysqlpandi',
            database: process.env.DB_NAME || 'swappay'
        });

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS feedbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(20), -- 'feedback' or 'issue'
                category VARCHAR(50) NULL,
                message TEXT,
                rating INT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;

        await connection.query(createTableQuery);
        console.log('Table "feedbacks" is ready.');
    } catch (err) {
        console.error('Error migrating "feedbacks" table:', err);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
