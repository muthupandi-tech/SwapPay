const mysql = require('mysql2/promise');

async function fixStuckSwaps() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log('Finding parent swaps that have 0 remaining amount but are stuck in matched/open status...');

        // Find parents
        const [parents] = await pool.execute(
            'SELECT id FROM swaps WHERE remaining_amount = 0 AND status != "completed"'
        );

        console.log(`Found ${parents.length} potential stuck parents.`);

        let fixedCount = 0;

        for (const parent of parents) {
            const pid = parent.id;

            // Check if ALL children are completed
            const [incompleteChildren] = await pool.execute(
                'SELECT id FROM swaps WHERE (parent_swap_id = ? OR matched_parent_swap_id = ?) AND status != "completed"',
                [pid, pid]
            );

            if (incompleteChildren.length === 0) {
                console.log(`Fixing Parent Swap ID: ${pid}`);
                await pool.execute('UPDATE swaps SET status = "completed" WHERE id = ?', [pid]);
                fixedCount++;
            } else {
                console.log(`Parent Swap ID: ${pid} still has incomplete children, skipping.`);
            }
        }

        console.log(`Successfully fixed ${fixedCount} parent swaps!`);

    } catch (err) {
        console.error('Error fixing stuck swaps:', err);
    } finally {
        await pool.end();
        process.exit();
    }
}

fixStuckSwaps();
