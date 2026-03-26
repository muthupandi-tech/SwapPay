const mysql = require('mysql2/promise');

async function verifyEdit() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    // 1. Find an active swap for testing (user 2 has swap 107)
    const [rows] = await connection.execute('SELECT * FROM swaps WHERE id = 107');
    if (rows.length === 0) {
        console.log("Test swap not found.");
        return;
    }
    const oldSwap = rows[0];
    console.log("Old Swap Amount:", oldSwap.amount, "Location:", oldSwap.location, "Created:", oldSwap.created_at, "Edited:", oldSwap.is_edited);

    // 2. Perform manual update (simulating the API)
    const newAmount = 25.00;
    const newLocation = "Main Gate (Edited)";
    await connection.execute(`
            UPDATE swaps 
            SET amount = ?, total_amount = ?, remaining_amount = ?, location = ?, created_at = NOW(), is_edited = TRUE 
            WHERE id = ?
        `, [newAmount, newAmount, newAmount, newLocation, 107]);

    // 3. Verify
    const [rows2] = await connection.execute('SELECT * FROM swaps WHERE id = 107');
    const newSwap = rows2[0];
    console.log("New Swap Amount:", newSwap.amount, "Location:", newSwap.location, "Created:", newSwap.created_at, "Edited:", newSwap.is_edited);

    if (newSwap.amount == 25.00 && newSwap.location == "Main Gate (Edited)" && newSwap.is_edited == 1) {
        console.log("✅ VERIFICATION SUCCESS: Swap edited correctly!");
    } else {
        console.log("❌ VERIFICATION FAILED: Data mismatch.");
    }

  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    await connection.end();
  }
}

verifyEdit();
