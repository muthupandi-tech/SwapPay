const mysql = require('mysql2');
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const promisePool = pool.promise();

async function testDelete() {
    try {
        console.log("Starting verification...");
        // 1. Create a dummy active swap
        const [insertResult] = await promisePool.execute(
            "INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [1, 'need_cash', 100, 100, 100, 'Test Location', 'active']
        );
        const swapId = insertResult.insertId;
        console.log(`Created test swap with ID: ${swapId}`);

        // 2. Fetch it to confirm
        const [rows] = await promisePool.execute("SELECT * FROM swaps WHERE id = ?", [swapId]);
        if (rows.length === 1) {
            console.log("Swap successfully created.");
        } else {
            throw new Error("Failed to create swap.");
        }

        // 3. Delete it
        await promisePool.execute("DELETE FROM swaps WHERE id = ?", [swapId]);
        console.log(`Deleted test swap with ID: ${swapId}`);

        // 4. Verify it's gone
        const [rowsAfter] = await promisePool.execute("SELECT * FROM swaps WHERE id = ?", [swapId]);
        if (rowsAfter.length === 0) {
            console.log("VERIFICATION SUCCESS: Swap was deleted from database.");
        } else {
            throw new Error("VERIFICATION FAILED: Swap still exists in database.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
}

testDelete();
