const mysql = require('mysql2/promise');

async function verifyMatchedData() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    const currentUserId = 2;

    const query1 = `
SELECT 
  m.id AS match_id,
  m.swap_id,
  s.status,
  s.amount,
  s.type,
  (SELECT COUNT(*) FROM chat_messages cm WHERE cm.swap_id = m.swap_id AND cm.sender_id != ? AND cm.status != 'seen') AS unread_count
FROM matches m
JOIN swaps s ON m.swap_id = s.id
WHERE 
  (s.status = 'matched' OR s.status = 'MATCHED' OR s.status = 'pending_confirmation')
  AND (m.requester_id = ? OR m.accepter_id = ?)
    `;
    
    const [rows] = await connection.execute(query1, [currentUserId, currentUserId, currentUserId]);
    
    console.log("Matched Swaps Row 0:", JSON.stringify(rows[0]));

    if (rows.length > 0 && rows[0].amount !== undefined && rows[0].type !== undefined && rows[0].unread_count !== undefined) {
        console.log("✅ VERIFICATION SUCCESS: All fields returned correctly!");
    } else if (rows.length === 0) {
        console.log("No matched swaps found for user 2, but query executed.");
    } else {
        console.log("❌ VERIFICATION FAILED: Data fields missing.");
    }

  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    await connection.end();
  }
}

verifyMatchedData();
