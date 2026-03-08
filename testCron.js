const mysql = require('mysql2/promise');
const { checkPendingSwaps } = require('./services/cronService');

async function testProgression() {
    const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'mysqlpandi', database: 'swappay' });

    // 1. Insert two users (skip if they exist)
    await pool.execute("INSERT IGNORE INTO users (id, name, email, password, role) VALUES (998, 'Alice', 'alice@test.com', 'pwd', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, email, password, role) VALUES (999, 'Bob', 'bob@test.com', 'pwd', 'user')");

    // 2. Insert a swap that has been matched 4 hours ago, and Alice completed it, but Bob didn't.
    // We'll set reminder_count to 1 and last_reminder_sent to 2 hours ago.
    await pool.execute("DELETE FROM swaps WHERE user_id IN (998,999)");
    const [res] = await pool.execute("INSERT INTO swaps (user_id, type, amount, location, status, matched_user_id, match_time, creator_completed, acceptor_completed, reminder_count, last_reminder_sent) VALUES (998, 'need_cash', 500, 'Library', 'matched', 999, DATE_SUB(NOW(), INTERVAL 4 HOUR), TRUE, FALSE, 1, DATE_SUB(NOW(), INTERVAL 2 HOUR))");

    console.log('Inserted test swap ID:', res.insertId);

    // 3. Run checkPendingSwaps, this should pick it up and send Count 2 email to Bob.
    console.log('Triggering check 1 (Should send count 2 to Bob)...');
    await checkPendingSwaps();

    // 4. Force time travel backwards to trigger again (Count 3 to Bob)
    await pool.execute("UPDATE swaps SET last_reminder_sent = DATE_SUB(NOW(), INTERVAL 3 HOUR) WHERE id = ?", [res.insertId]);
    console.log('Triggering check 2 (Should send count 3 to Bob)...');
    await checkPendingSwaps();

    // 5. Cleanup
    await pool.execute("DELETE FROM swaps WHERE user_id IN (998,999)");
    await pool.execute("DELETE FROM users WHERE id IN (998,999)");

    pool.end();
}
testProgression().catch(console.error);
