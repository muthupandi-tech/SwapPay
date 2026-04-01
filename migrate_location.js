const mysql = require('mysql2/promise');

async function runMigration() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });

    try {
        console.log('Running database migration for location filtering...');
        
        await pool.execute('ALTER TABLE users ADD COLUMN latitude FLOAT NULL');
        console.log('Added column latitude');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column latitude already exists.');
        } else {
            console.error('Error adding latitude:', e);
        }
    }

    try {
        await pool.execute('ALTER TABLE users ADD COLUMN longitude FLOAT NULL');
        console.log('Added column longitude');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column longitude already exists.');
        } else {
            console.error('Error adding longitude:', e);
        }
    }

    try {
        await pool.execute('ALTER TABLE users ADD COLUMN search_radius INT DEFAULT 300');
        console.log('Added column search_radius');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column search_radius already exists.');
        } else {
            console.error('Error adding search_radius:', e);
        }
    }

    console.log('Migration completed successfully.');
    await pool.end();
}

runMigration();
