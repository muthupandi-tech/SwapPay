const pool = require('../config/db');
const bcrypt = require('bcrypt');

async function addAdmin() {
    const name = 'Admin';
    const email = 'swappay.official@gmail.com';
    const password = 'Swap1228Pay';
    const phone = '0000000000';
    const college = 'SwapPay HQ';
    const role = 'admin';

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const checkQuery = 'SELECT id FROM users WHERE email = $1';
        const { rows: existing } = await pool.query(checkQuery, [email]);

        if (existing.length > 0) {
            console.log('Admin already exists. Updating password and role...');
            await pool.query('UPDATE users SET password = $1, role = $2, is_verified = TRUE WHERE email = $3', [hashedPassword, role, email]);
        } else {
            console.log('Creating new admin...');
            await pool.query(
                'INSERT INTO users (name, email, password, phone, college, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, TRUE)',
                [name, email, hashedPassword, phone, college, role]
            );
        }
        console.log('Admin added successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error adding admin:', err);
        process.exit(1);
    }
}

addAdmin();
