const { Pool } = require("pg");
const pool = new Pool({
    connectionString: "postgres://neondb_owner:npg_wX7MmeLB0FTU@ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

(async () => {
    try {
        const currentUserId = 3; // Testing for User B
        
        const query1 = `
SELECT 
  m.id AS match_id,
  m.swap_id,
  m.requester_id,
  m.accepter_id,
  s.status,
  s.amount,
  s.type,
  s.location
FROM matches m
JOIN swaps s ON m.swap_id = s.id
WHERE 
  (s.status = 'matched' OR s.status = 'MATCHED' OR s.status = 'pending_confirmation')
  AND (m.requester_id = $1 OR m.accepter_id = $2)
ORDER BY m.created_at DESC LIMIT 5;
        `;
        
        const { rows: rows1 } = await pool.query(query1, [currentUserId, currentUserId]);
        console.log("Query 1 Results:");
        console.table(rows1);

        const query2 = `
SELECT 
  s.id AS match_id,
  s.id AS swap_id,
  s.user_id AS requester_id,
  s.matched_user_id AS accepter_id,
  s.status,
  s.allow_partial_match,
  s.amount,
  s.type
FROM swaps s
WHERE (s.status = 'matched' OR s.status = 'MATCHED' OR s.status = 'pending_confirmation')
AND (s.user_id = $1 OR s.matched_user_id = $2)
AND s.parent_swap_id IS NULL
AND s.matched_user_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM swaps child 
  WHERE (child.parent_swap_id = s.id OR child.matched_parent_swap_id = s.id)
    AND s.allow_partial_match = true
)
ORDER BY s.created_at DESC LIMIT 5;
        `;
        
        const { rows: rows2 } = await pool.query(query2, [currentUserId, currentUserId]);
        console.log("Query 2 Results:");
        console.table(rows2);
        
    } catch (e) { console.error(e); } finally { pool.end(); }
})();
