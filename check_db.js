const mysql = require('mysql2/promise');

async function checkDb() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });

    try {
        const [users] = await pool.execute('SELECT id, email, lat, lng FROM users');
        console.log('Users:', users);

        if (users.length > 0) {
            const userId = users[0].id;
            console.log('Testing getOpenSwaps query for user', userId);

            const [swaps] = await pool.execute(`
                SELECT s.id, s.type, s.amount, s.location, s.lat, s.lng, s.created_at, u.name as requester_name,
                (SELECT AVG(stars) FROM ratings WHERE rated_user_id = s.user_id) as requester_rating
                FROM swaps s 
                JOIN users u ON s.user_id = u.id 
                WHERE s.status = 'open' AND s.user_id != ? 
                ORDER BY s.created_at DESC
            `, [userId]);
            console.log('Open Swaps Query Result:', swaps.length, 'rows found.');
            console.log(swaps);
        }
    } catch (e) {
        console.error('DB Error:', e);
    } finally {
        pool.end();
    }
}
checkDb();
