const { Pool } = require("pg");
const pool = new Pool({
    connectionString: "postgres://neondb_owner:npg_wX7MmeLB0FTU@ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

(async () => {
    try {
        const userA = 1;
        const userB = 3;

        // User A creates Crowd Swap
        const { rows: aSwapRows } = await pool.query(`INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match, allow_partner_selection, auto_accept_perfect, lat, lng, is_partial) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`, [userA, "need_cash", 1000, 1000, 1000, "Location A", "active", true, true, false, 0, 0, false]);
        const crowdSwapId = aSwapRows[0].id;

        // User B creates Normal Swap
        const { rows: bSwapRows } = await pool.query(`INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match, allow_partner_selection, auto_accept_perfect, lat, lng, is_partial) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`, [userB, "need_upi", 1000, 1000, 1000, "Location B", "active", false, false, false, 0, 0, false]);
        const normalSwapId = bSwapRows[0].id;

        // User A accepts User B
        const newRemaining = 0;
        await pool.query(`UPDATE swaps SET remaining_amount = $1, status = $2, match_time = NOW() WHERE id = $3`, [newRemaining, "matched", crowdSwapId]);

        const { rows: childRows } = await pool.query(`
            INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10) RETURNING id
        `, [userA, "need_cash", 1000, 1000, 0, "Location A", "matched", userB, crowdSwapId, normalSwapId]);
        const childSwapId = childRows[0].id;

        await pool.query(`
          UPDATE swaps
          SET remaining_amount = $1, status = $2, matched_user_id = $3, match_time = NOW()
          WHERE id = $4
        `, [0, "matched", userA, normalSwapId]);

        await pool.query(`
          INSERT INTO matches (swap_id, requester_id, accepter_id, status, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [childSwapId, userB, userA, "matched"]);

        console.log("Fake Match Created!");
        console.log("Crowd Swap (A):", crowdSwapId);
        console.log("Normal Swap (B):", normalSwapId);
        console.log("Child Swap:", childSwapId);
    } catch (e) { console.error(e); } finally { pool.end(); }
})();
