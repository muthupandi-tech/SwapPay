// const mysql = require('mysql2/promise');
const { Pool } = require('pg');

async function testQuery() {
    /*
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });
    */
    const pool = new Pool({
        host: "ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech",
        user: "neondb_owner",
        password: "npg_wX7MmeLB0FTU",
        database: "neondb",
        port: 5432,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Testing Active Swaps Query...');
        const query = `
            SELECT s.*,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE s.status = 'active' OR s.status = 'open'
            ORDER BY s.created_at DESC LIMIT 5
        `;
        // const [rows] = await pool.execute(query);
        const { rows } = await pool.query(query);
        console.log('Query returned successfully. Rows:', rows.length);
        
        console.log('Testing Swap Feed Query...');
        const feedQ = `
            SELECT 
              s.id,
              s.user_id,
              u.name,
              s.latitude as creator_lat,
              s.longitude as creator_lng,
              s.amount,
              s.type,
              s.status,
              s.is_edited,
              s.location,
              s.created_at,
              (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as trustScore
            FROM swaps s
            JOIN users u ON s.user_id = u.id
            WHERE (LOWER(s.status) = 'active' OR LOWER(s.status) = 'open')
        `;
        // const [feedRows] = await pool.execute(feedQ);
        const { rows: feedRows } = await pool.query(feedQ);
        console.log('Feed Query returned successfully. Rows:', feedRows.length);
        
    } catch (e) {
        console.error('Database Error:', e);
    }
    pool.end();
}

testQuery();
