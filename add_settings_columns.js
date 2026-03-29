const mysql = require('mysql2');
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
});

const promisePool = pool.promise();

async function migrate() {
    try {
        console.log("Checking and adding notification columns to users table...");
        await promisePool.execute("ALTER TABLE users ADD COLUMN notification_sound BOOLEAN DEFAULT TRUE");
        await promisePool.execute("ALTER TABLE users ADD COLUMN notification_vibration BOOLEAN DEFAULT TRUE");
        await promisePool.execute("ALTER TABLE users ADD COLUMN notification_animation BOOLEAN DEFAULT TRUE");
        console.log("Migration completely successful!");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Columns already exist.");
        } else {
            console.error("Migration failed:", e);
        }
    } finally {
        pool.end();
    }
}

migrate();
