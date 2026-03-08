const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function alterDatabase() {
    console.log("Adding Partner Selection columns to `swaps` table...");

    try {
        const query = `
            ALTER TABLE swaps 
            ADD COLUMN is_selected BOOLEAN DEFAULT FALSE,
            ADD COLUMN selection_group_id VARCHAR(255) DEFAULT NULL,
            ADD COLUMN partner_priority_rank INT DEFAULT 0,
            ADD COLUMN allow_partner_selection BOOLEAN DEFAULT FALSE,
            ADD COLUMN auto_accept_perfect BOOLEAN DEFAULT TRUE;
        `;

        await pool.execute(query);
        console.log("Columns successfully added!");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Columns already exist, skipping.");
        } else {
            console.error("Error altering table:", e);
        }
    } finally {
        await pool.end();
        console.log("Database update complete.");
    }
}

alterDatabase();
