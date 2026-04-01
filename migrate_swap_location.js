const mysql = require('mysql2/promise');

async function runMigration() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });

    try {
        console.log('Running database migration for swaps location...');
        
        await pool.execute('ALTER TABLE swaps ADD COLUMN latitude FLOAT NULL');
        console.log('Added column latitude to swaps');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column latitude already exists in swaps.');
        } else {
            console.error('Error adding latitude:', e);
        }
    }

    try {
        await pool.execute('ALTER TABLE swaps ADD COLUMN longitude FLOAT NULL');
        console.log('Added column longitude to swaps');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column longitude already exists in swaps.');
        } else {
            console.error('Error adding longitude:', e);
        }
    }

    console.log('Migration completed successfully.');
    await pool.end();
}

runMigration();
