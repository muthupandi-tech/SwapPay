const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
});

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL server.');

    const alterQuery1 = "ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user'";
    const alterQuery2 = "ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE";

    // Notification Updates
    const alterQuery3 = "ALTER TABLE notifications ADD COLUMN title VARCHAR(255) DEFAULT 'Alert'";
    const alterQuery4 = "ALTER TABLE notifications ADD COLUMN type VARCHAR(50) DEFAULT 'system'";

    connection.query(alterQuery1, (err) => {
        if (err && err.code !== 'ER_DUP_FIELDNAME') console.error(err);
        else console.log('Added role column');

        connection.query(alterQuery2, (err) => {
            if (err && err.code !== 'ER_DUP_FIELDNAME') console.error(err);
            else console.log('Added is_blocked column');

            const createSettingsTableQuery = `
                CREATE TABLE IF NOT EXISTS settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    setting_key VARCHAR(50) UNIQUE NOT NULL,
                    setting_value VARCHAR(255) NOT NULL
                )
            `;
            connection.query(createSettingsTableQuery, (err) => {
                if (err) console.error('Error creating settings table:', err);
                else {
                    console.log('Ensured settings table exists.');
                    const seedSettingQuery = `
                        INSERT IGNORE INTO settings (setting_key, setting_value) 
                        VALUES ('email_notifications_enabled', 'true')
                    `;
                    connection.query(seedSettingQuery, (err) => {
                        if (err) console.error('Error seeding default settings:', err);
                        else {
                            console.log('Ensured default settings exist.');
                        }
                    });
                }
            });

            // Notification alterations
            connection.query(alterQuery3, (err) => {
                if (err && err.code !== 'ER_DUP_FIELDNAME') console.error(err);
                else console.log('Added title column to notifications');

                connection.query(alterQuery4, (err) => {
                    if (err && err.code !== 'ER_DUP_FIELDNAME') console.error(err);
                    else {
                        console.log('Added type column to notifications');

                        // Re-run dbSetup to seed admin (safe due to IF NOT EXISTS and IGNORE)
                        require('./dbSetup.js');
                        // exit the simple migrator nicely after a delay
                        setTimeout(() => process.exit(0), 1000);
                    }
                });
            });
        });
    });
});
