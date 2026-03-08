const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function runTest() {
    console.log("Setting up auto-match test...");

    // 1. Clear swaps for a clean slate
    await pool.execute('DELETE FROM swaps');

    // 2. Mock 2 users if they don't exist
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (101, 'Test User A', '123', 'a@test.com', 'College', 'pass', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (102, 'Test User B', '456', 'b@test.com', 'College', 'pass', 'user')");

    try {
        // --- 3. Simulate calling createSwap controller for User A ---
        console.log("User A creates a request for 100 Cash...");

        // Manual simulation of the controller logic to bypass the session middleware
        const amount = 100;
        const typeA = 'need_cash';

        const [insertA] = await pool.execute(
            'INSERT INTO swaps (user_id, type, amount, location, status) VALUES (?, ?, ?, ?, ?)',
            [101, typeA, amount, 'Library', 'open']
        );
        console.log("User A swap created with ID:", insertA.insertId);

        // --- 4. Simulate calling createSwap controller for User B ---
        console.log("User B creates a request for 100 UPI...");
        const userIdB = 102;
        const typeB = 'need_upi';

        // Execute the exact auto-match lookup query from the controller
        const oppositeType = typeB === 'need_cash' ? 'need_upi' : 'need_cash';
        const [matchRows] = await pool.execute(`
            SELECT * FROM swaps 
            WHERE status = 'open' AND amount = ? AND type = ? AND user_id != ? 
            ORDER BY created_at ASC LIMIT 1
        `, [amount, oppositeType, userIdB]);

        if (matchRows.length > 0) {
            console.log("SUCCESS: Auto-Match logic found the opposite swap!");
            const matchedSwap = matchRows[0];

            // Execute the update
            await pool.execute(
                'UPDATE swaps SET status = ?, matched_user_id = ?, match_time = NOW() WHERE id = ?',
                ['matched', userIdB, matchedSwap.id]
            );
            console.log(`Swap ID ${matchedSwap.id} successfully updated to 'matched' with partner ${userIdB}!`);
        } else {
            console.log("FAILED: Auto-match query did not find User A's swap.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        console.log("Test finished.");
    }
}

runTest();
