const mysql = require('mysql2/promise');

async function testQuery() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'mysqlpandi',
        database: 'swappay'
    });
    
    try {
        const query = `
            SELECT s.*, 
                   u1.email AS creator_email, u1.name AS creator_name,
                   u2.email AS acceptor_email, u2.name AS acceptor_name
            FROM swaps s
            JOIN users u1 ON s.user_id = u1.id
            JOIN users u2 ON s.matched_user_id = u2.id
            WHERE s.status = 'matched'
            AND (
                s.last_reminder_sent IS NULL 
                OR s.last_reminder_sent <= DATE_SUB(NOW(), INTERVAL ? HOUR)
            )
        `;

        const [swaps] = await pool.execute(query, [1]);
        console.log("Success");
    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        pool.end();
    }
}
testQuery();
