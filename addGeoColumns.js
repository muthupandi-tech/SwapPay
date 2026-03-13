const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

async function run() {
    try {
        console.log("Applying DB Alters for Geo-Fencing...");

        // Add to users
        try { await pool.execute('ALTER TABLE users ADD COLUMN lat DECIMAL(10, 8) DEFAULT NULL'); } catch (e) { console.log(e.message); }
        try { await pool.execute('ALTER TABLE users ADD COLUMN lng DECIMAL(11, 8) DEFAULT NULL'); } catch (e) { console.log(e.message); }

        // Add to swaps
        try { await pool.execute('ALTER TABLE swaps ADD COLUMN lat DECIMAL(10, 8) DEFAULT NULL'); } catch (e) { console.log(e.message); }
        try { await pool.execute('ALTER TABLE swaps ADD COLUMN lng DECIMAL(11, 8) DEFAULT NULL'); } catch (e) { console.log(e.message); }

        console.log("Done.");
    } catch (e) {
        console.log(e.message);
    } finally {
        await pool.end();
    }
}
run();
