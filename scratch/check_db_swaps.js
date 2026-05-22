const pool = require('../config/db');

(async () => {
    try {
        const { rows: users } = await pool.query('SELECT id, name, email FROM users LIMIT 10');
        console.log('--- USERS ---');
        console.table(users);

        const { rows: swaps } = await pool.query(`
            SELECT s.id, s.user_id, u.name, s.type, s.amount, s.status, s.created_at 
            FROM swaps s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC 
            LIMIT 10
        `);
        console.log('--- SWAPS (Latest 10) ---');
        console.table(swaps);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
})();
