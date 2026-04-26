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
        console.log('Connected to PostgreSQL for comprehensive migration.');

        // 1. Users Table Alterations
        const userAlters = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_sound BOOLEAN DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_vibration BOOLEAN DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_animation BOOLEAN DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_progress INT DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS campus_name VARCHAR(150) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS block_name VARCHAR(150) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_match BOOLEAN DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_best_match_score DECIMAL(10, 4) DEFAULT 0"
        ];

        for (const query of userAlters) {
            await pool.query(query);
        }
        console.log('Ensured all columns exist in users table.');

        // 2. Swaps Table Alterations
        const swapAlters = [
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS matched_user_id INT DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS match_time TIMESTAMP DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS creator_completed BOOLEAN DEFAULT FALSE",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS acceptor_completed BOOLEAN DEFAULT FALSE",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMP DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS reminder_count INT DEFAULT 0",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8) DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8) DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(10, 2) DEFAULT NULL",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS allow_partial_match BOOLEAN DEFAULT FALSE",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS allow_partner_selection BOOLEAN DEFAULT FALSE",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS auto_accept_perfect BOOLEAN DEFAULT TRUE",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS last_smart_notified_score DECIMAL(10, 4) DEFAULT 0",
            "ALTER TABLE swaps ADD COLUMN IF NOT EXISTS completed_by TEXT DEFAULT '[]'"
        ];

        for (const query of swapAlters) {
            await pool.query(query);
        }
        console.log('Ensured all columns exist in swaps table.');

        // 3. Ratings Table Alterations
        const ratingAlters = [
            "ALTER TABLE ratings ADD COLUMN IF NOT EXISTS rater_user_id INT",
            "ALTER TABLE ratings ADD COLUMN IF NOT EXISTS rated_user_id INT"
        ];

        for (const query of ratingAlters) {
            await pool.query(query);
        }
        console.log('Ensured all columns exist in ratings table.');

        // 4. Notifications Table Alterations
        const notificationAlters = [
            "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT 'Alert'",
            "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'system'"
        ];

        for (const query of notificationAlters) {
            await pool.query(query);
        }
        console.log('Ensured all columns exist in notifications table.');

        // 5. Create Settings Table if not exists
        const createSettingsTableQuery = `
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value VARCHAR(255) NOT NULL
            )
        `;
        await pool.query(createSettingsTableQuery);
        console.log('Ensured settings table exists.');

        // 6. Seed default settings
        const seedSettingQuery = `
            INSERT INTO settings (setting_key, setting_value) 
            VALUES ('email_notifications_enabled', 'true'),
                   ('reminder_interval_hours', '1'),
                   ('max_reminders', '6')
            ON CONFLICT (setting_key) DO NOTHING
        `;
        await pool.query(seedSettingQuery);
        console.log('Ensured default settings exist.');

        // 7. Chat Messages Table Alterations
        const chatAlters = [
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent'"
        ];

        for (const query of chatAlters) {
            await pool.query(query);
        }
        console.log('Ensured all columns exist in chat_messages table.');

        // 8. Feedbacks Table Alterations
        const feedbackAlters = [
            "ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'feedback'",
            "ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT NULL",
            "ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS message TEXT DEFAULT NULL",
            "ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS rating INT DEFAULT NULL"
        ];

        for (const query of feedbackAlters) {
            await pool.query(query);
        }
        
        // Migrate existing data from 'feedback' to 'message' if 'feedback' column exists
        try {
            await pool.query("UPDATE feedbacks SET message = feedback WHERE message IS NULL AND feedback IS NOT NULL");
        } catch (e) {
            // feedback column might not exist in all environments, ignore error
        }

        console.log('Ensured all columns exist in feedbacks table.');

        console.log('Migration completed successfully.');
        
        // Re-run dbSetup to seed admin (safe due to IF NOT EXISTS and ON CONFLICT)
        // require('./dbSetup.js'); // Skipping require to avoid immediate execution if it's already ran

        setTimeout(() => {
            pool.end();
            process.exit(0);
        }, 1000);

    } catch (error) {
        console.error('Migration error:', error);
        await pool.end();
        process.exit(1);
    }
})();
