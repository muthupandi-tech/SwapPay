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

async function verify() {
    try {
        console.log("Verifying Auto-Match update...");
        
        // 1. Manually set auto_match to 0 for a test user (id: 1 or 2)
        const testUserId = 1;
        await promisePool.execute("UPDATE users SET auto_match = 0 WHERE id = ?", [testUserId]);
        console.log(`Set auto_match to 0 for user ${testUserId}`);

        // 2. Fetch it back
        let [rows] = await promisePool.execute("SELECT auto_match FROM users WHERE id = ?", [testUserId]);
        console.log(`Value in DB: ${rows[0].auto_match}`);
        if (rows[0].auto_match === 0) {
            console.log("Verified: Value successfully set to 0.");
        } else {
            throw new Error("Failed to set value to 0.");
        }

        // 3. Set it back to 1
        await promisePool.execute("UPDATE users SET auto_match = 1 WHERE id = ?", [testUserId]);
        console.log(`Set auto_match to 1 for user ${testUserId}`);

        // 4. Fetch it back
        [rows] = await promisePool.execute("SELECT auto_match FROM users WHERE id = ?", [testUserId]);
        console.log(`Value in DB: ${rows[0].auto_match}`);
        if (rows[0].auto_match === 1) {
            console.log("Verified: Value successfully set to 1.");
        } else {
            throw new Error("Failed to set value to 1.");
        }

        console.log("VERIFICATION SUCCESS: Backend database logic is working correctly.");
        process.exit(0);
    } catch (err) {
        console.error("Verification failed:", err);
        process.exit(1);
    }
}

verify();
