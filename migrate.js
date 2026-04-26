// const mysql = require('mysql2');
const { Pool } = require('pg');

const pool = new Pool({
    host: "ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech",
    user: "neondb_owner",
    password: "npg_wX7MmeLB0FTU",
    database: "neondb",
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

(async () => {
    try {
        console.log('Connected to PostgreSQL.');

        const alterQuery1 = "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'";
        const alterQuery2 = "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE";

        // Notification Updates
        const alterQuery3 = "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT 'Alert'";
        const alterQuery4 = "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'system'";

        await pool.query(alterQuery1);
        console.log('Ensured role column exists');
        await pool.query(alterQuery2);
        console.log('Ensured is_blocked column exists');

        const createSettingsTableQuery = `
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value VARCHAR(255) NOT NULL
            )
        `;
        await pool.query(createSettingsTableQuery);
        console.log('Ensured settings table exists.');

        const seedSettingQuery = `
            INSERT INTO settings (setting_key, setting_value) 
            VALUES ('email_notifications_enabled', 'true')
            ON CONFLICT (setting_key) DO NOTHING
        `;
        await pool.query(seedSettingQuery);
        console.log('Ensured default settings exist.');

        // Notification alterations
        await pool.query(alterQuery3);
        console.log('Ensured title column exists in notifications');
        await pool.query(alterQuery4);
        console.log('Ensured type column exists in notifications');

        // Re-run dbSetup to seed admin (safe due to IF NOT EXISTS and ON CONFLICT)
        require('./dbSetup.js');

        setTimeout(() => {
            pool.end();
            process.exit(0);
        }, 2000);

    } catch (error) {
        console.error('Migration error:', error);
        await pool.end();
        process.exit(1);
    }
})();
