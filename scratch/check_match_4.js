const pool = require('../config/db');

async function checkMatch() {
    const swapId = 4;
    try {
        const { rows } = await pool.query('SELECT * FROM matches WHERE swap_id = $1', [swapId]);
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkMatch();
