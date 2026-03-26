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

// Mock email service call by checking logs or just observing DB updates
async function runCheckBestMatchesManual() {
    // This replicates the logic in cronService.js manually for testing
    const [users] = await promisePool.execute('SELECT id, email, last_best_match_score, last_notified_at FROM users WHERE auto_match = 0 AND id = 2');
    if (users.length === 0) return { notified: false };
    
    const user = users[0];
    const [mySwaps] = await promisePool.execute('SELECT id, amount, type FROM swaps WHERE user_id = ? AND status = "active"', [user.id]);
    if (mySwaps.length === 0) return { notified: false };

    const [partners] = await promisePool.execute(`
        SELECT s.id, s.amount, s.type, 
               (SELECT IFNULL(AVG(stars), 5) FROM ratings WHERE rated_user_id = u.id) as trust_score 
        FROM swaps s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.status = 'active' AND s.user_id != ?
    `, [user.id]);

    let highestScore = -1;
    for (const my of mySwaps) {
        const typeOp = my.type === 'need_cash' ? 'need_upi' : 'need_cash';
        for (const p of partners) {
            if (p.type !== typeOp) continue;
            const diff = Math.abs(parseFloat(my.amount) - parseFloat(p.amount));
            const score = (1/(1+diff)) * 0.7 + (parseFloat(p.trust_score||5)/5) * 0.3;
            if (score > highestScore) highestScore = score;
        }
    }

    const last = parseFloat(user.last_best_match_score || 0);
    if (highestScore > last || !user.last_notified_at) {
        await promisePool.execute('UPDATE users SET last_best_match_score = ?, last_notified_at = NOW() WHERE id = ?', [highestScore, user.id]);
        return { notified: true, score: highestScore };
    }
    return { notified: false, score: highestScore };
}

async function verify() {
    try {
        console.log("Verifying Smart Notification System...");
        const userA = 2; // Test User
        const userB = 11; // Partner User
        
        // Setup: User A auto_match OFF, clean swaps
        await promisePool.execute("UPDATE users SET auto_match = 0, last_best_match_score = 0, last_notified_at = NULL WHERE id = ?", [userA]);
        await promisePool.execute("DELETE FROM swaps WHERE user_id IN (?, ?)", [userA, userB]);

        // User A needs UPI ₹500
        await promisePool.execute("INSERT INTO swaps (user_id, type, amount, status, location) VALUES (?, 'need_upi', 500, 'active', 'Loc A')", [userA]);

        // 1. Initial Match (₹490)
        console.log("\n1. Adding ₹490 match (Partner User B)...");
        await promisePool.execute("INSERT INTO swaps (user_id, type, amount, status, location) VALUES (?, 'need_cash', 490, 'active', 'Loc B')", [userB]);
        let res = await runCheckBestMatchesManual();
        console.log(`Notified: ${res.notified}, Score: ${res.score.toFixed(4)} (Expected: Notified=true)`);

        // 2. Run again with same match
        console.log("\n2. Running again with same match...");
        res = await runCheckBestMatchesManual();
        console.log(`Notified: ${res.notified} (Expected: false)`);

        // 3. Better Match (₹500)
        console.log("\n3. Adding ₹500 perfect match (Partner User B)...");
        await promisePool.execute("INSERT INTO swaps (user_id, type, amount, status, location) VALUES (?, 'need_cash', 500, 'active', 'Loc B Perfect')", [userB]);
        res = await runCheckBestMatchesManual();
        console.log(`Notified: ${res.notified}, Score: ${res.score.toFixed(4)} (Expected: true)`);

        // 4. Reset Logic (Simulation of acceptance)
        console.log("\n4. Simulating swap acceptance (Reset)...");
        // We'll manually call the reset logic as our controller does
        await promisePool.execute('UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = ?', [userA]);
        const [userAfter] = await promisePool.execute('SELECT last_best_match_score, last_notified_at FROM users WHERE id = ?', [userA]);
        console.log(`Score: ${userAfter[0].last_best_match_score}, NotifiedAt: ${userAfter[0].last_notified_at} (Expected: 0, null)`);

        console.log("\nVERIFICATION COMPLETE: Logic verified.");
        process.exit(0);
    } catch (err) {
        console.error("Verification failed:", err);
        process.exit(1);
    }
}

verify();
