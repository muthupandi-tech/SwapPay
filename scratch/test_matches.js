const pool = require('./config/db');

async function testQuery() {
    try {
        console.log("Fetching matches table...");
        const matches = await pool.query('SELECT * FROM matches');
        console.log("Matches:", matches.rows);

        console.log("Fetching swaps table...");
        const swaps = await pool.query('SELECT id, user_id, parent_swap_id, matched_parent_swap_id, status FROM swaps WHERE id IN (SELECT swap_id FROM matches)');
        console.log("Swaps from matches:", swaps.rows);

        const query1 = `
            SELECT 
            m.id AS match_id,
            m.swap_id,
            m.requester_id,
            m.accepter_id,
            s.status
            FROM matches m
            JOIN swaps s ON m.swap_id = s.id
            WHERE 
            (s.status = 'matched' OR s.status = 'MATCHED' OR s.status = 'pending_confirmation')
        `;
        const q1res = await pool.query(query1);
        console.log("Query 1 result:", q1res.rows);

    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

testQuery();
