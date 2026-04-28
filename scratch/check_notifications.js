const pool = require('../config/db');

async function checkNotificationsTable() {
    try {
        const { rows } = await pool.query(`
            SELECT column_name, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'notifications'
        `);
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkNotificationsTable();
