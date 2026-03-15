const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function run() {
    try {
        console.log("Creating chat_messages table if not exists...");
        const query = `
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
        await pool.execute(query);
        console.log("Successfully created chat_messages table.");
    } catch (e) {
        console.error("Error creating chat_messages table:", e.message);
    } finally {
        await pool.end();
    }
}
run();
