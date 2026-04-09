const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        const [rows] = await connection.execute('DESCRIBE swaps');
        console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error('Error fetching schema:', error);
    } finally {
        await connection.end();
    }
}

checkSchema();
