const mysql = require('mysql2/promise');

async function checkDb() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
  });

  try {
    console.log("--- SWAPS TABLE ---");
    const [swaps] = await connection.execute('SELECT id, user_id, matched_user_id, status, parent_swap_id FROM swaps ORDER BY id DESC LIMIT 10');
    console.table(swaps);

    console.log("\n--- MATCHES TABLE ---");
    const [matches] = await connection.execute('SELECT id, swap_id, requester_id, accepter_id, status FROM matches ORDER BY id DESC LIMIT 10');
    console.table(matches);

    // Find any swap that is both ACTIVE and has a MATCH
    console.log("\n--- SWAPS THAT ARE 'ACTIVE' BUT HAVE A MATCH RECORD ---");
    const [overlap] = await connection.execute(`
      SELECT s.id, s.status, m.id as match_id, m.status as match_status 
      FROM swaps s 
      JOIN matches m ON s.id = m.swap_id 
      WHERE s.status IN ('active', 'open')
    `);
    console.table(overlap);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkDb();
