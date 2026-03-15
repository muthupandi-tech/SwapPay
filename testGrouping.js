const mysql = require('mysql2/promise');

async function testMySwapsLogic() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });

    const [rows] = await pool.execute(`
        SELECT s.id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.created_at, s.user_id, s.matched_user_id,
        s.creator_completed, s.acceptor_completed, s.parent_swap_id, s.matched_parent_swap_id
        FROM swaps s 
    `);

    // Mock an active user ID (test 1)
    const userId = 1;

    const swapsWithContext = rows.filter(s => s.user_id === userId || s.matched_user_id === userId).map(swap => {
        return {
            ...swap,
            isCreator: swap.user_id === userId
        };
    });

    try {
        const parents = {};
        const children = [];

        swapsWithContext.forEach(swap => {
            let isParent = !swap.parent_swap_id && !swap.matched_parent_swap_id;
            
            if (isParent || (!swap.parent_swap_id && swap.isCreator)) {
                parents[swap.id] = { ...swap, childChunks: [] };
            } else {
                children.push(swap);
            }
        });

        children.forEach(child => {
            let myParentId = child.isCreator ? child.parent_swap_id : child.matched_parent_swap_id;
            if (parents[myParentId]) {
                parents[myParentId].childChunks.push(child);
            } else {
                parents[child.id] = { ...child, childChunks: [] };
            }
        });

        console.log("Success! Extracted parents count:", Object.keys(parents).length);
        console.log("No undefined loops!");
    } catch (e) {
        console.error("Crash during grouping:", e);
    }
    
    pool.end();
}

testMySwapsLogic();
