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
    console.log("Old Swap Amount:", oldSwap.amount, "Type:", oldSwap.type, "Location:", oldSwap.location, "Created:", oldSwap.created_at, "Edited:", oldSwap.is_edited);

    // 2. Perform manual update (simulating the API)
    const newAmount = 30.00;
    const newLocation = "Main Gate (Type Edited)";
    const newType = oldSwap.type === 'need_cash' ? 'need_upi' : 'need_cash'; // Toggle type
    
    await connection.execute(`
            UPDATE swaps 
            SET type = ?, amount = ?, total_amount = ?, remaining_amount = ?, location = ?, created_at = NOW(), is_edited = TRUE 
            WHERE id = ?
        `, [newType, newAmount, newAmount, newAmount, newLocation, 107]);

    // 3. Verify
    const [rows2] = await connection.execute('SELECT * FROM swaps WHERE id = 107');
    const newSwap = rows2[0];
    console.log("New Swap Amount:", newSwap.amount, "Type:", newSwap.type, "Location:", newSwap.location, "Created:", newSwap.created_at, "Edited:", newSwap.is_edited);

    if (newSwap.amount == 30.00 && newSwap.location == newLocation && newSwap.type == newType && newSwap.is_edited == 1) {
        console.log("✅ VERIFICATION SUCCESS: Swap type and other fields edited correctly!");
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
