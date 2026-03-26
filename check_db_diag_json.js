const mysql = require('mysql2/promise');

async function checkDb() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    const [swaps] = await connection.execute('SELECT id, user_id, matched_user_id, status, parent_swap_id FROM swaps ORDER BY id DESC LIMIT 10');
    console.log("--- SWAPS (Latest 10) ---");
    console.log(JSON.stringify(swaps, null, 2));

    const [matches] = await connection.execute('SELECT id, swap_id, requester_id, accepter_id, status FROM matches ORDER BY id DESC LIMIT 10');
    console.log("\n--- MATCHES (Latest 10) ---");
    console.log(JSON.stringify(matches, null, 2));

    const [overlap] = await connection.execute(`
      SELECT s.id, s.status, m.id as match_id, m.status as match_status 
      FROM swaps s 
      JOIN matches m ON s.id = m.swap_id 
      WHERE (s.status = 'active' OR s.status = 'open')
    `);
    console.log("\n--- ACTIVE SWAPS WITH MATCH RECORDS ---");
    console.log(JSON.stringify(overlap, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkDb();
