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

        // Add status column to feedbacks table
        const alterTableQuery = `
            ALTER TABLE feedbacks 
            ADD COLUMN status VARCHAR(20) DEFAULT 'open'
        `;

        await connection.query(alterTableQuery);
        console.log('Column "status" added to "feedbacks" table.');
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Column "status" already exists in "feedbacks" table.');
        } else {
            console.error('Error adding "status" column:', err);
        }
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
