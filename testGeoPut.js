const mysql = require('mysql2/promise');
const geo = require('./utils/geo');

async function testPut() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });
    
    try {
        const lat = 10.957;
        const lng = 77.955;
        const userId = 2; // Testing with a known user ID

        console.log("Checking geo:", lat, lng);
        console.log("Is inside:", geo.isInsideCampus(lat, lng));
        
        if (!geo.isInsideCampus(lat, lng)) {
            console.log("Failed geo check.");
            return;
        }

        await pool.execute(
            'UPDATE users SET lat = ?, lng = ?, campus_name = "Auto-Verified Campus" WHERE id = ?',
            [lat, lng, userId]
        );
        console.log("DB Update successful");

    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        pool.end();
    }
}
testPut();
