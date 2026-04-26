const { Pool } = require('pg');
const pool = new Pool({
    host: "ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech",
    user: "neondb_owner",
    password: "npg_wX7MmeLB0FTU",
    database: "neondb",
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const query = `
            SELECT s.id, s.user_id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.matched_user_id, s.match_time, s.parent_swap_id, s.matched_parent_swap_id, s.lat, s.lng, s.completed_at, s.created_at, s.is_edited
            FROM swaps s
            LIMIT 1
        `;
        const res = await pool.query(query);
        console.log('Query successful!');
    } catch (err) {
        console.error('Query Failed!');
        console.error(err);
    } finally {
        pool.end();
    }
})();
