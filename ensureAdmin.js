const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function ensureAdmin() {
    console.log('--- SwapPay Admin Verification ---');
    
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'mysqlpandi',
            database: process.env.DB_NAME || 'swappay'
        });

        const adminEmail = 'swappay.official@gmail.com';
        console.log(`Checking status for: ${adminEmail}`);

        const [rows] = await connection.execute('SELECT id, role FROM users WHERE email = ?', [adminEmail]);

        if (rows.length > 0) {
            const user = rows[0];
            if (user.role !== 'admin') {
                console.log(`User found with role "${user.role}". Updating to "admin"...`);
                await connection.execute('UPDATE users SET role = "admin" WHERE id = ?', [user.id]);
                console.log('✅ User role updated to admin successfully.');
            } else {
                console.log('✅ User is already an administrator.');
            }

            // Also reset password to the new requested one
            console.log('Resetting password to: SwapPayAdmin123...');
            const newHashedPassword = await bcrypt.hash('SwapPayAdmin123', 10);
            await connection.execute('UPDATE users SET password = ? WHERE id = ?', [newHashedPassword, user.id]);
            console.log('✅ Password updated successfully.');
        } else {
            console.log('User not found. Creating new admin account...');
            const hashedPassword = await bcrypt.hash('SwapPayAdmin123', 10);
            await connection.execute(
                'INSERT INTO users (name, phone, email, college, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['System Admin', '0000000000', adminEmail, 'AdminHQ', hashedPassword, 'admin', true]
            );
            console.log('✅ New admin account created successfully with password: SwapPayAdmin123');
            console.log('⚠️ Please change this password immediately after logging in.');
        }

    } catch (error) {
        console.error('❌ Error during admin verification:', error.message);
    } finally {
        if (connection) await connection.end();
        console.log('---------------------------------');
    }
}

ensureAdmin();
