const mysql = require('mysql2/promise');
const { sendSwapCompletedEmail } = require('./utils/emailService');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function runTest() {
    console.log("Setting up Completion loop test...");

    // 1. Clear swaps for a clean slate
    await pool.execute('DELETE FROM swaps');

    // 2. Mock 2 users if they don't exist
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (101, 'Test User A', '123', 'a@test.com', 'College', 'pass', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (102, 'Test User B', '456', 'b@test.com', 'College', 'pass', 'user')");

    try {
        const amount = 350; // Mocking a swap amount!

        // 3. Inject a pre-matched swap directly into the database
        const [insertA] = await pool.execute(
            'INSERT INTO swaps (user_id, matched_user_id, type, amount, location, status, creator_completed, acceptor_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [101, 102, 'need_cash', amount, 'Library', 'matched', true, false]
        );
        const swapId = insertA.insertId;
        console.log(`Pre-matched Swap ID ${swapId} created. Creator(101) has completed = true, Acceptor(102) = false`);

        // 4. Simulate the second user (User B / 102) completing the swap!
        console.log("Simulating Acceptor completing the swap...");

        // ** The code extracted directly from swapController's completeSwap method: **
        const checkQuery = 'SELECT status, user_id, matched_user_id, creator_completed, acceptor_completed, amount FROM swaps WHERE id = ?';
        const [rows] = await pool.execute(checkQuery, [swapId]);
        const swap = rows[0];

        // Simulate acceptor clicking complete
        await pool.execute('UPDATE swaps SET acceptor_completed = TRUE WHERE id = ?', [swapId]);

        // Re-fetch to check if BOTH are now true
        const [updatedRows] = await pool.execute(checkQuery, [swapId]);
        const updatedSwap = updatedRows[0];

        if (updatedSwap.creator_completed && updatedSwap.acceptor_completed) {
            console.log(`BOTH users completed! Amount fetched from DB was: ${updatedSwap.amount}`);

            // Call the emailer service to see the text logged!
            const [u1Rows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [swap.user_id]);
            const [u2Rows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [swap.matched_user_id]);

            console.log("\nFIRING EMAILS:");
            // Send to creator
            await sendSwapCompletedEmail(u1Rows[0].email, u2Rows[0].name, swap.amount);
            // Send to matcher
            await sendSwapCompletedEmail(u2Rows[0].email, u1Rows[0].name, swap.amount);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        console.log("\nTest finished.");
    }
}

runTest();
