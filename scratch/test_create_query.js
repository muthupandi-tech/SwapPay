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
        const query = 'SELECT auto_match, lat, lng FROM users WHERE id = $1';
        const res = await pool.query(query, [1]);
        console.log('Query successful!', res.rows);
    } catch (err) {
        console.error('Query Failed!');
        console.error(err);
    } finally {
        pool.end();
    }
})();
