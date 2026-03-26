const mysql = require('mysql2/promise');

async function testSmartNotifyOpen() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    console.log("--- STARTING SMART NOTIFY 'OPEN' TEST ---");

    // 1. Setup User A (auto_match = 0)
    const userA_id = 11; // Pandi
    await connection.execute('UPDATE users SET auto_match = 0, last_best_match_score = 0, last_notified_at = NULL WHERE id = ?', [userA_id]);

    // 2. Create 'open' swap for User A
    console.log("Creating 'open' swap for User A...");
    await connection.execute('DELETE FROM swaps WHERE user_id = ?', [userA_id]);
    await connection.execute(`
      INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status) 
      VALUES (?, 'need_cash', 500, 500, 500, 'Library', 'open')
    `, [userA_id]);

    // 3. Create 'open' swap for User B (Partner)
    const userB_id = 2; // User 2
    console.log("Creating 'open' swap for User B...");
    await connection.execute('DELETE FROM swaps WHERE user_id = ?', [userB_id]);
    await connection.execute(`
      INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status) 
      VALUES (?, 'need_upi', 500, 500, 500, 'Library', 'open')
    `, [userB_id]);

    // 4. Manually run the core logic of checkBestMatches for this user
    console.log("Running manual check logic...");
    
    const [mySwaps] = await connection.execute(
        'SELECT id, amount, type FROM swaps WHERE user_id = ? AND (status = "active" OR status = "open")',
        [userA_id]
    );
    console.log(`User A swaps found: ${mySwaps.length}`);

    const [partners] = await connection.execute(`
        SELECT s.id, s.amount, s.type, s.location, u.name as partner_name,
               (SELECT IFNULL(AVG(stars), 5) FROM ratings WHERE rated_user_id = u.id) as partner_avg_rating
        FROM swaps s
        JOIN users u ON s.user_id = u.id
        WHERE (s.status = 'active' OR s.status = 'open') AND s.user_id != ?
    `, [userA_id]);
    console.log(`Potential partners found: ${partners.length}`);

    if (mySwaps.length > 0 && partners.length > 0) {
      console.log("SUCCESS: Core match identification works with 'open' status.");
    } else {
      console.error("FAILURE: 'open' status swaps were NOT found.");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

testSmartNotifyOpen();
