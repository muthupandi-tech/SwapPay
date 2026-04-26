// const mysql = require('mysql2');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

(async () => {
    try {
        console.log('Connected to PostgreSQL.');
        console.log('Using database from connection string.');

        // Create users table if not exists
        const createUsersTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                email VARCHAR(120) UNIQUE NOT NULL,
                college VARCHAR(150) NOT NULL,
                campus_name VARCHAR(150) DEFAULT NULL,
                block_name VARCHAR(150) DEFAULT NULL,
                lat DECIMAL(10, 8) DEFAULT NULL,
                lng DECIMAL(11, 8) DEFAULT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                is_blocked BOOLEAN DEFAULT FALSE,
                notification_sound BOOLEAN DEFAULT TRUE,
                notification_vibration BOOLEAN DEFAULT TRUE,
                notification_animation BOOLEAN DEFAULT TRUE,
                recovery_progress INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createUsersTableQuery);
        console.log('Table "users" is ready.');

        // Seed admin user
        const bcrypt = require('bcrypt');
        const adminPasswordHash = await bcrypt.hash('admin123', 10);
        const seedAdminQuery = `
            INSERT INTO users (name, phone, email, college, password, role) 
            VALUES ('System Admin', '0000000000', 'swappay.official@gmail.com', 'AdminHQ', $1, 'admin')
            ON CONFLICT (email) DO NOTHING
        `;
        await pool.query(seedAdminQuery, [adminPasswordHash]);
        console.log('Admin user seeded (if not already present).');

        // Create swaps table if not exists
        const createSwapsTableQuery = `
            CREATE TABLE IF NOT EXISTS swaps (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(20) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                location VARCHAR(255) NOT NULL,
                lat DECIMAL(10, 8) DEFAULT NULL,
                lng DECIMAL(11, 8) DEFAULT NULL,
                status VARCHAR(20) DEFAULT 'open',
                matched_user_id INT DEFAULT NULL,
                match_time TIMESTAMP NULL,
                creator_completed BOOLEAN DEFAULT FALSE,
                acceptor_completed BOOLEAN DEFAULT FALSE,
                last_reminder_sent TIMESTAMP NULL,
                reminder_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
        await pool.query(createSwapsTableQuery);
        console.log('Table "swaps" is ready.');

        // Create ratings table if not exists
        const createRatingsTableQuery = `
            CREATE TABLE IF NOT EXISTS ratings (
                id SERIAL PRIMARY KEY,
                swap_id INT NOT NULL,
                rater_user_id INT NOT NULL,
                rated_user_id INT NOT NULL,
                stars INT NOT NULL CHECK(stars BETWEEN 1 AND 5),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (swap_id) REFERENCES swaps(id) ON DELETE CASCADE
            )
        `;
        await pool.query(createRatingsTableQuery);
        console.log('Table "ratings" is ready.');

        // Create notifications table if not exists
        const createNotificationsTableQuery = `
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) DEFAULT 'Alert',
                message VARCHAR(255) NOT NULL,
                type VARCHAR(50) DEFAULT 'system',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
        await pool.query(createNotificationsTableQuery);
        console.log('Table "notifications" is ready.');

        // Create settings table if not exists
        const createSettingsTableQuery = `
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value VARCHAR(255) NOT NULL
            )
        `;
        await pool.query(createSettingsTableQuery);
        console.log('Table "settings" is ready.');

        // Create chat_messages table if not exists
        const createChatMessagesTableQuery = `
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                swap_id INT NOT NULL,
                sender_id INT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (swap_id) REFERENCES swaps(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
        await pool.query(createChatMessagesTableQuery);
        console.log('Table "chat_messages" is ready.');

        // Create feedbacks table if not exists
        const createFeedbacksTableQuery = `
            CREATE TABLE IF NOT EXISTS feedbacks (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(20),
                category VARCHAR(50) NULL,
                message TEXT,
                rating INT NULL,
                status VARCHAR(20) DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
        await pool.query(createFeedbacksTableQuery);
        console.log('Table "feedbacks" is ready.');

        // Seed default settings after all tables are ready
        const seedSettingQuery = `
            INSERT INTO settings (setting_key, setting_value) 
            VALUES ('email_notifications_enabled', 'true'),
                   ('reminder_interval_hours', '1'),
                   ('max_reminders', '6')
            ON CONFLICT (setting_key) DO NOTHING
        `;
        await pool.query(seedSettingQuery);
        console.log('Default settings seeded (if not already present).');

    } catch (err) {
        console.error('Error during database setup:', err);
    } finally {
        await pool.end();
        console.log('PostgreSQL connection closed.');
    }
})();
