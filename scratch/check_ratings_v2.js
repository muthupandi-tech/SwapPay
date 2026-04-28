const pool = require('../config/db');

async function checkRatingsConstraints() {
    try {
        const { rows } = await pool.query(`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'ratings'
        `);
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkRatingsConstraints();
