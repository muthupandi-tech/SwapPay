const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function runTest() {
    console.log("Setting up Partner Selection test...");

    // 1. Clear swaps for a clean slate
    await pool.execute('DELETE FROM swaps');

    try {
        console.log("Creating 3 smaller open requests (Needs UPI - they want to give cash)...");

        // Pre-insert smaller open swaps
        await pool.execute("INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [102, 'need_upi', 100, 100, 100, 'Lib', 'open', true]);
        const [res1] = await pool.execute("SELECT id FROM swaps WHERE user_id = 102 ORDER BY id DESC LIMIT 1");

        await pool.execute("INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [103, 'need_upi', 50, 50, 50, 'Lib', 'open', true]);
        const [res2] = await pool.execute("SELECT id FROM swaps WHERE user_id = 103 ORDER BY id DESC LIMIT 1");

        await pool.execute("INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [104, 'need_upi', 200, 200, 200, 'Lib', 'open', true]);
        const [res3] = await pool.execute("SELECT id FROM swaps WHERE user_id = 104 ORDER BY id DESC LIMIT 1");

        // A giant swap request needs 500 cash.
        // It allows partial matching & partner selection.
        console.log("Creating Massive Requester Request (Needs Cash 500, allows partial, allows selection)...");
        const type = 'need_cash';

        const insertQuery = 'INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match, allow_partner_selection, auto_accept_perfect) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await pool.execute(insertQuery, [101, 'need_cash', 500, 500, 500, 'Lib', 'open', true, true, false]);
        const newParentSwapId = result.insertId;

        console.log(`Parent Swap created with ID: ${newParentSwapId}`);
        console.log("Simulating user checking available partners...");

        // Simulate `getAvailablePartners` internally
        const oppositeType = 'need_upi';
        let remainingNeeded = 500;
        let candidateQuery = "SELECT s.* FROM swaps s WHERE s.status = 'open' AND s.type = ? AND s.user_id != ? AND s.remaining_amount > 0 AND (s.allow_partial_match = TRUE OR s.remaining_amount <= ?) ORDER BY s.created_at ASC";
        const [matchRows] = await pool.execute(candidateQuery, [oppositeType, 101, remainingNeeded]);

        console.log(`Found ${matchRows.length} candidates.`);

        if (matchRows.length > 0) {
            console.log("Simulating user 'Locking' 2 of the 3 partners via 'confirmPartners' API equivalent...\n");

            // They select the first two:
            const selectedPartners = [
                { id: matchRows[0].id, amount: matchRows[0].remaining_amount }, // 100
                { id: matchRows[1].id, amount: matchRows[1].remaining_amount }  // 50
            ];

            let selectionGroupId = 'GRP-' + Date.now();
            let matchedChunks = [];

            for (let i = 0; i < selectedPartners.length; i++) {
                const partner = selectedPartners[i];
                const candidateId = partner.id;
                const requestedChunk = parseFloat(partner.amount);

                if (remainingNeeded <= 0) break;

                const [pRows] = await pool.execute('SELECT remaining_amount, user_id, status FROM swaps WHERE id = ? AND status = "open"', [candidateId]);
                if (pRows.length === 0) continue;

                const candidateSwap = pRows[0];
                const candidateRemaining = parseFloat(candidateSwap.remaining_amount);

                let actualChunk = Math.min(requestedChunk, candidateRemaining, remainingNeeded);
                if (actualChunk <= 0) continue;

                const newCandidateRemaining = candidateRemaining - actualChunk;
                const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'open';

                await pool.execute(
                    'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time), is_selected = TRUE, selection_group_id = ?, partner_priority_rank = ? WHERE id = ?',
                    [newCandidateRemaining, candidateStatus, candidateStatus, selectionGroupId, i + 1, candidateId]
                );

                const [childResult] = await pool.execute(`
                    INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
                `, [
                    101, type, actualChunk, actualChunk, 0, 'Lib', 'matched', candidateSwap.user_id, newParentSwapId, candidateId
                ]);

                matchedChunks.push(actualChunk);
                remainingNeeded -= actualChunk;
            }

            const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'open';
            await pool.execute(
                'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time) WHERE id = ?',
                [remainingNeeded, finalParentStatus, finalParentStatus, newParentSwapId]
            );

            console.log(`\nFinal Result:
Original Request: 500
Selected and Locked: ${matchedChunks.join(', ')} (Total: ${matchedChunks.reduce((a, b) => a + b, 0)})
Remaining Open on Parent: ${remainingNeeded}
Final Parent Status: ${finalParentStatus}`);

            // Verification queries
            const [verifyRows] = await pool.execute('SELECT * FROM swaps WHERE parent_swap_id = ? OR id = ?', [newParentSwapId, newParentSwapId]);
            console.log('\nResulting Database Rows for this Request Hierarchy:');
            console.table(verifyRows.map(r => ({ id: r.id, type: r.type, total: r.total_amount, rem: r.remaining_amount, status: r.status, is_sel: r.is_selected, parent: r.parent_swap_id })));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        console.log("Test finished.");
    }
}

runTest();
