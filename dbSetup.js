const mysql = require('mysql2');

// Initial connection without database selected to create it if it doesn't exist
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi' // Placeholder for user configuration
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL server.');

    // Create database if not exists
    connection.query('CREATE DATABASE IF NOT EXISTS swappay', (err, results) => {
        if (err) {
            console.error('Error creating database:', err);
            connection.end();
            return;
        }
        console.log('Database "swappay" is ready.');

        // Switch to the newly created database
        connection.query('USE swappay', (err) => {
            if (err) {
                console.error('Error selecting database:', err);
                connection.end();
                return;
            }

            // Create users table if not exists
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    phone VARCHAR(20) NOT NULL,
                    email VARCHAR(120) UNIQUE NOT NULL,
                    college VARCHAR(150) NOT NULL,
                    campus_name VARCHAR(150) DEFAULT NULL,
                    block_name VARCHAR(150) DEFAULT NULL,
                    lat DECIMAL(10, 8) DEFAULT NULL,
                    lng DECIMAL(11, 8) DEFAULT NULL,
                    password VARCHAR(255) NOT NULL,
                    role ENUM('user', 'admin') DEFAULT 'user',
                    is_blocked BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;

            connection.query(createTableQuery, async (err, results) => {
                if (err) {
                    console.error('Error creating users table:', err);
                } else {
                    console.log('Table "users" is ready.');

                    // Seed admin user
                    const bcrypt = require('bcrypt');
                    const adminPasswordHash = await bcrypt.hash('admin123', 10);
                    const seedAdminQuery = `
                        INSERT IGNORE INTO users (name, phone, email, college, password, role) 
                        VALUES ('System Admin', '0000000000', 'admin@swappay.com', 'AdminHQ', ?, 'admin')
                    `;
                    connection.query(seedAdminQuery, [adminPasswordHash], (seedErr) => {
                        if (seedErr) console.error('Error seeding admin user:', seedErr);
                        else console.log('Admin user seeded (if not already present).');
                    });
                }

                const createSwapsTableQuery = `
                    CREATE TABLE IF NOT EXISTS swaps (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        type ENUM('need_cash', 'need_upi') NOT NULL,
                        amount DECIMAL(10, 2) NOT NULL,
                        location VARCHAR(255) NOT NULL,
                        lat DECIMAL(10, 8) DEFAULT NULL,
                        lng DECIMAL(11, 8) DEFAULT NULL,
                        status ENUM('open', 'matched', 'completed') DEFAULT 'open',
                        matched_user_id INT DEFAULT NULL,
                        match_time TIMESTAMP NULL,
                        creator_completed BOOLEAN DEFAULT FALSE,
                        acceptor_completed BOOLEAN DEFAULT FALSE,
                        last_reminder_sent TIMESTAMP NULL,
                        reminder_count INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `;

                connection.query(createSwapsTableQuery, (err, results) => {
                    if (err) {
                        console.error('Error creating swaps table:', err);
                    } else {
                        console.log('Table "swaps" is ready.');
                    }

                    const createRatingsTableQuery = `
                        CREATE TABLE IF NOT EXISTS ratings (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            swap_id INT NOT NULL,
                            rater_user_id INT NOT NULL,
                            rated_user_id INT NOT NULL,
                            stars INT NOT NULL CHECK(stars BETWEEN 1 AND 5),
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (swap_id) REFERENCES swaps(id) ON DELETE CASCADE
                        )
                    `;

                    connection.query(createRatingsTableQuery, (err, results) => {
                        if (err) {
                            console.error('Error creating ratings table:', err);
                        } else {
                            console.log('Table "ratings" is ready.');
                        }

                        const createNotificationsTableQuery = `
                            CREATE TABLE IF NOT EXISTS notifications (
                                id INT AUTO_INCREMENT PRIMARY KEY,
                                user_id INT NOT NULL,
                                title VARCHAR(255) DEFAULT 'Alert',
                                message VARCHAR(255) NOT NULL,
                                type VARCHAR(50) DEFAULT 'system',
                                is_read BOOLEAN DEFAULT FALSE,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                            )
                        `;

                        connection.query(createNotificationsTableQuery, (err, results) => {
                            if (err) {
                                console.error('Error creating notifications table:', err);
                            } else {
                                console.log('Table "notifications" is ready.');
                            }

                            const createSettingsTableQuery = `
                                CREATE TABLE IF NOT EXISTS settings (
                                    id INT AUTO_INCREMENT PRIMARY KEY,
                                    setting_key VARCHAR(50) UNIQUE NOT NULL,
                                    setting_value VARCHAR(255) NOT NULL
                                )
                            `;

                            connection.query(createSettingsTableQuery, (err) => {
                                if (err) {
                                    console.error('Error creating settings table:', err);
                                } else {
                                    console.log('Table "settings" is ready.');

                                    const createChatMessagesTableQuery = `
                                        CREATE TABLE IF NOT EXISTS chat_messages (
                                            id INT AUTO_INCREMENT PRIMARY KEY,
                                            swap_id INT NOT NULL,
                                            sender_id INT NOT NULL,
                                            message TEXT NOT NULL,
                                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            FOREIGN KEY (swap_id) REFERENCES swaps(id) ON DELETE CASCADE,
                                            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
                                        )
                                    `;

                                    connection.query(createChatMessagesTableQuery, (err) => {
                                        if (err) {
                                            console.error('Error creating chat_messages table:', err);
                                        } else {
                                            console.log('Table "chat_messages" is ready.');

                                            // Seed default email notification setting
                                            const seedSettingQuery = `
                                        INSERT IGNORE INTO settings (setting_key, setting_value) 
                                        VALUES ('email_notifications_enabled', 'true'),
                                               ('reminder_interval_hours', '1'),
                                               ('max_reminders', '6')
                                    `;
                                    connection.query(seedSettingQuery, (err) => {
                                        if (err) console.error('Error seeding default settings:', err);
                                        else console.log('Default settings seeded (if not already present).');

                                        // Close connection
                                        connection.end();
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
});
