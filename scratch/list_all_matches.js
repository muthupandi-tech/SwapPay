const pool = require('../config/db');

async function listMatches() {
    try {
        const { rows } = await pool.query('SELECT * FROM matches');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listMatches();
