// const mysql = require('mysql2/promise');
const { Pool } = require('pg');
require('dotenv').config();

/*
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'mysqlpandi',
    database: process.env.DB_NAME || 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
*/

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool;
