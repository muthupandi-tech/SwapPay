const mysql = require('mysql2/promise');
const chatController = require('./controllers/chatController');

async function testChat() {
    console.log("Starting Chat API & Controller Test...");
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay',
    });

    try {
        // 1. Create two test users
        console.log("Setting up test users...");
        await pool.execute("DELETE FROM users WHERE email LIKE 'chat_%'");
        const [u1] = await pool.execute("INSERT INTO users (name, phone, email, college, password) VALUES ('Chat User 1', '1231231231', 'chat_u1@test.com', 'Test College', 'hash')");
        const [u2] = await pool.execute("INSERT INTO users (name, phone, email, college, password) VALUES ('Chat User 2', '1231231232', 'chat_u2@test.com', 'Test College', 'hash')");
        
        const user1Id = u1.insertId;
        const user2Id = u2.insertId;

        // 2. Create a Matched Swap
        console.log("Creating matched swap...");
        const [s1] = await pool.execute(
            "INSERT INTO swaps (user_id, type, amount, location, status, matched_user_id) VALUES (?, 'need_cash', 500, 'Test Location', 'matched', ?)",
            [user1Id, user2Id]
        );
        const swapId = s1.insertId;

        // 3. Test saving a message
        console.log("Saving mock socket messages...");
        const savedMsg1 = await chatController.saveMessage(swapId, user1Id, "Hello, are you near the library?");
        if (savedMsg1) {
            console.log("✅ Message 1 saved successfully:", savedMsg1.message);
        } else {
            console.error("❌ Failed to save Message 1");
        }

        const savedMsg2 = await chatController.saveMessage(swapId, user2Id, "Yes, I am heading there now.");
        if (savedMsg2) {
            console.log("✅ Message 2 saved successfully:", savedMsg2.message);
        } else {
            console.error("❌ Failed to save Message 2");
        }

        // 4. Test Chat History Fetching directly via DB wrapper to verify route theory
        console.log("Verifying chat history DB retrieval...");
        const [history] = await pool.execute("SELECT * FROM chat_messages WHERE swap_id = ?", [swapId]);
        if (history.length === 2) {
            console.log("✅ Correct number of messages found in history.");
        } else {
            console.error("❌ History retrieval mismatch. Found", history.length);
        }

        // Cleanup
        console.log("Cleaning up test data...");
        await pool.execute("DELETE FROM swaps WHERE id = ?", [swapId]);
        await pool.execute("DELETE FROM users WHERE id IN (?, ?)", [user1Id, user2Id]);

        console.log("Test Finished.");
    } catch (e) {
        console.error("Test failed with error:", e);
    } finally {
        await pool.end();
    }
}

testChat();
