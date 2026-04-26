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
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables in public schema:');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
})();
