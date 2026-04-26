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
        const res = await pool.query("SELECT * FROM swaps LIMIT 1");
        if (res.rows.length > 0) {
            console.log('Columns in swaps table:', Object.keys(res.rows[0]));
        } else {
            console.log('Swaps table is empty, checking columns via information_schema...');
            const colRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'swaps'");
            console.log('Columns:', colRes.rows.map(r => r.column_name));
        }
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
})();
