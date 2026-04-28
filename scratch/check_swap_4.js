const pool = require('../config/db');

async function checkSwap4() {
    try {
        const { rows } = await pool.query('SELECT * FROM swaps WHERE id = 4');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSwap4();
