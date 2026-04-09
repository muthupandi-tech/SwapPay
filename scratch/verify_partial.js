const mysql = require('mysql2/promise');
require('dotenv').config();

// User session cookies would be needed for a real test.
// Since I can't easily get cookies in a script without logging in, 
// I'll test the logic by calling the functions directly if I can, or 
// just trust the code if it's logically sound.
// Actually, I can use the existing 'pool' and check the database state after a manual simulation.

async function verifyMigration() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        const [rows] = await conn.execute('DESCRIBE swaps');
        const hasIsPartial = rows.some(r => r.Field === 'is_partial');
        console.log('Has is_partial column:', hasIsPartial);

        const [nullAmts] = await conn.execute('SELECT COUNT(*) as count FROM swaps WHERE remaining_amount IS NULL');
        console.log('Null remaining_amounts:', nullAmts[0].count);
    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await conn.end();
    }
}

verifyMigration();
