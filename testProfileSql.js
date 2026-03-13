const mysql = require('mysql2/promise');

async function testQuery() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });

    try {
        const [users] = await pool.execute('SELECT id, name, phone, email, college, campus_name, lat, lng, block_name, role, created_at FROM users LIMIT 1');
        console.log('Query success:', users);

        const userId = users[0].id;
        const [ratingRows] = await pool.execute(
            `SELECT r.stars, r.created_at, u.name as rater_name 
             FROM ratings r
             JOIN users u ON r.rater_user_id = u.id
             WHERE r.rated_user_id = ?
             ORDER BY r.created_at DESC`,
            [userId]
        );
        console.log('Ratings success:', ratingRows);
    } catch (e) {
        console.error('SQL Error:', e);
    } finally {
        pool.end();
    }
}
testQuery();
