const pool = require('../config/db');

async function checkChildren() {
    const parentId = 4;
    try {
        const { rows } = await pool.query('SELECT * FROM swaps WHERE parent_swap_id = $1 OR matched_parent_swap_id = $1', [parentId]);
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkChildren();
