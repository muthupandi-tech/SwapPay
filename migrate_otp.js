const mysql = require('mysql2/promise');

async function migrate() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });

    try {
        console.log('Adding verification columns...');
        await pool.query(`ALTER TABLE users 
            ADD COLUMN is_verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN otp_code VARCHAR(6),
            ADD COLUMN otp_expiry DATETIME`);
        console.log('Columns added.');

        console.log('Verifying existing users...');
        await pool.query(`UPDATE users SET is_verified = TRUE`);
        console.log('Existing users updated successfully.');
        
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Columns already exist. Verifying existing users just in case...');
            await pool.query(`UPDATE users SET is_verified = TRUE`);
        } else {
            console.error('Migration error:', e);
        }
    } finally {
        pool.end();
    }
}

migrate();
