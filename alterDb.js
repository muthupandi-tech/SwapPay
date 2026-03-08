const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function run() {
    try {
        console.log("Applying DB Alters for Partial Matching...");
        await pool.execute('ALTER TABLE swaps ADD COLUMN total_amount DECIMAL(10,2) NOT NULL DEFAULT 0');
        await pool.execute('ALTER TABLE swaps ADD COLUMN remaining_amount DECIMAL(10,2) NOT NULL DEFAULT 0');
        await pool.execute('ALTER TABLE swaps ADD COLUMN allow_partial_match BOOLEAN DEFAULT FALSE');
        await pool.execute('ALTER TABLE swaps ADD COLUMN parent_swap_id INT DEFAULT NULL');
        await pool.execute('ALTER TABLE swaps ADD COLUMN matched_parent_swap_id INT DEFAULT NULL');

        console.log("Backfilling existing data...");
        await pool.execute('UPDATE swaps SET total_amount = amount, remaining_amount = amount WHERE total_amount = 0');
        await pool.execute("UPDATE swaps SET remaining_amount = 0 WHERE status IN ('matched', 'completed')");

        console.log("Done.");
    } catch (e) {
        console.log(e.message);
    } finally {
        await pool.end();
    }
}
run();
