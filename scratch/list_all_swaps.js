const pool = require('../config/db');

async function listAllSwaps() {
    try {
        const { rows } = await pool.query('SELECT id, user_id, amount, status, parent_swap_id, matched_parent_swap_id, matched_user_id FROM swaps');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAllSwaps();
