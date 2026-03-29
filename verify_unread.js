const mysql = require('mysql2/promise');

async function verifyUnreadIndicator() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    const currentUserId = 2; // Testing for User 2
    const testSwapId = 111; // Valid matched swap in both tables
    const partnerId = 11; // User 11 is the partner

    console.log(`Starting verification for user ${currentUserId} on swap ${testSwapId}...`);

    // 1. Clear existing unread messages for this test to be clean
    await connection.execute('UPDATE chat_messages SET status = "seen" WHERE swap_id = ? AND sender_id != ?', [testSwapId, currentUserId]);

    // 2. Insert a new unread message from partner (user 11)
    const [insertResult] = await connection.execute(
      'INSERT INTO chat_messages (swap_id, sender_id, message, status) VALUES (?, ?, ?, ?)',
      [testSwapId, partnerId, "Hello verification 111!", "sent"]
    );

    // 3. Simulate getMatchedSwaps query1
    const query1 = `
SELECT 
  m.id AS match_id,
  m.swap_id,
  (SELECT COUNT(*) FROM chat_messages cm WHERE cm.swap_id = m.swap_id AND cm.sender_id != ? AND cm.status != 'seen') AS unread_count
FROM matches m
WHERE m.swap_id = ? AND (m.requester_id = ? OR m.accepter_id = ?)
    `;
    const [rows] = await connection.execute(query1, [currentUserId, testSwapId, currentUserId, currentUserId]);
    
    console.log("Unread Count from query1:", rows[0]?.unread_count);

    if (rows[0]?.unread_count === 1) {
        console.log("✅ VERIFICATION SUCCESS: Unread message count is correct!");
    } else {
        console.log("❌ VERIFICATION FAILED: Unread message count mismatch.");
    }

    // Cleanup
    await connection.execute('DELETE FROM chat_messages WHERE id = ?', [insertResult.insertId]);

  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    await connection.end();
  }
}

verifyUnreadIndicator();
