const pool = require('../config/db');

async function checkSwapsTable() {
    try {
        const { rows } = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'swaps'
            ORDER BY ordinal_position
        `);
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSwapsTable();
