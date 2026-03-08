const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function runTest() {
    console.log("Setting up Crowd-Swap test...");

    // 1. Clear swaps for a clean slate
    await pool.execute('DELETE FROM swaps');

    // 2. Mock 5 users if they don't exist
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (101, 'Massive Requester', '123', 'a@test.com', 'College', 'pass', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (102, 'Chunk 1', '456', 'b1@test.com', 'College', 'pass', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (103, 'Chunk 2', '456', 'b2@test.com', 'College', 'pass', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (104, 'Chunk 3', '456', 'b3@test.com', 'College', 'pass', 'user')");
    await pool.execute("INSERT IGNORE INTO users (id, name, phone, email, college, password, role) VALUES (105, 'Chunk 4', '456', 'b4@test.com', 'College', 'pass', 'user')");

    try {
        console.log("Creating 3 smaller open requests (Needs UPI - they want to give cash)...");

        // Pre-insert smaller open swaps
        await pool.execute("INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [102, 'need_upi', 100, 100, 100, 'Lib', 'open', true]);
        await pool.execute("INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [103, 'need_upi', 50, 50, 50, 'Lib', 'open', true]);
        await pool.execute("INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [104, 'need_upi', 200, 200, 200, 'Lib', 'open', true]);

        // A giant swap request needs 500 cash.
        // It allows partial matching.
        console.log("Creating Massive Requester Request (Needs Cash 500, allows partial)...");
        const type = 'need_cash';
        const parsedAmount = 500;
        const isPartialAllowed = true;
        const userId = 101;

        // --- AUTO-MATCHING CROWD-SWAP LOGIC FROM CONTROLLER ---
        const insertQuery = 'INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await pool.execute(insertQuery, [101, 'need_cash', 500, 500, 500, 'Lib', 'open', true]);
        const newParentSwapId = result.insertId;

        const oppositeType = 'need_upi';
        let remainingNeeded = 500;
        let matchedChunks = [];

        while (remainingNeeded > 0) {
            let candidateQuery = "SELECT * FROM swaps WHERE status = 'open' AND type = ? AND user_id != ? AND remaining_amount > 0 AND (allow_partial_match = TRUE OR remaining_amount <= ?) ORDER BY created_at ASC LIMIT 1";
            const [matchRows] = await pool.execute(candidateQuery, [oppositeType, userId, remainingNeeded]);

            if (matchRows.length === 0) {
                console.log("No more chunks found!");
                break;
            }

            const candidate = matchRows[0];
            let chunkAmount = Math.min(remainingNeeded, parseFloat(candidate.remaining_amount));

            console.log(`Matched against User ${candidate.user_id} for ₹${chunkAmount}.`);

            const newCandidateRemaining = candidate.remaining_amount - chunkAmount;
            const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'open';

            await pool.execute('UPDATE swaps SET remaining_amount = ?, status = ? WHERE id = ?', [newCandidateRemaining, candidateStatus, candidate.id]);

            const [childResult] = await pool.execute(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, parent_swap_id, matched_parent_swap_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [userId, type, chunkAmount, chunkAmount, 0, 'Lib', 'matched', candidate.user_id, newParentSwapId, candidate.id]);

            matchedChunks.push(chunkAmount);
            remainingNeeded -= chunkAmount;
        }

        const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'open';
        await pool.execute('UPDATE swaps SET remaining_amount = ?, status = ? WHERE id = ?', [remainingNeeded, finalParentStatus, newParentSwapId]);

        console.log(`\nFinal Result:
Original: 500
Chunks Assorted: ${matchedChunks.join(', ')}
Remaining: ${remainingNeeded}
Final Status: ${finalParentStatus}`);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        console.log("Test finished.");
    }
}

runTest();
