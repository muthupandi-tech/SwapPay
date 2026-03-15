const mysql = require('mysql2/promise');

async function testMatchedSwaps() {
    try {
        const promisePool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: 'mysqlpandi',
            database: 'swappay'
        });

        const userId = 1; // assuming user 1 exists

        const query = `
            SELECT s.*,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE (s.user_id = ? OR s.matched_user_id = ?) AND s.status = 'matched'
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId, userId]);

        const swapsWithContext = rows.map(swap => {
            return {
                ...swap,
                isCreator: swap.user_id === userId,
                otherPartyName: swap.user_id === userId ? swap.matched_name : swap.creator_name,
                otherPartyId: swap.user_id === userId ? swap.matched_user_id : swap.user_id,
                otherPartyRating: swap.user_id === userId ? swap.matched_rating : swap.creator_rating
            };
        });

        console.log("Success!", swapsWithContext.length);
        process.exit(0);
    } catch (error) {
        console.error("DB Error:", error);
        process.exit(1);
    }
}

testMatchedSwaps();
