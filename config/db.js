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
    host: "ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech",
    user: "neondb_owner",
    password: "npg_wX7MmeLB0FTU",
    database: "neondb",
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool;
