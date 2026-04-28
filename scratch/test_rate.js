const pool = require('../config/db');
const { sendRatingReceivedEmail } = require('../utils/emailService');

async function testRate() {
    const swapId = 4;
    const userId = 1; // Assuming user 1
    const stars = 4;

    try {
        const { rows } = await pool.query('SELECT status, user_id, matched_user_id FROM swaps WHERE id = $1', [swapId]);
        console.log('Swap:', rows[0]);
        const swap = rows[0];

        let ratedUserId = (swap.user_id === userId) ? swap.matched_user_id : swap.user_id;
        console.log('Rated User ID:', ratedUserId);

        const { rows: ratingRows } = await pool.query('SELECT id FROM ratings WHERE swap_id = $1 AND rater_user_id = $2', [swapId, userId]);
        console.log('Existing ratings:', ratingRows.length);

        await pool.query('INSERT INTO ratings (swap_id, rater_user_id, rated_user_id, stars) VALUES ($1, $2, $3, $4)', [swapId, userId, ratedUserId, stars]);
        console.log('Inserted rating');

        const { rows: userRows } = await pool.query('SELECT email FROM users WHERE id = $1', [ratedUserId]);
        console.log('User Email:', userRows[0].email);

        const { rows: trustRows } = await pool.query('SELECT AVG(stars) AS avg_stars FROM ratings WHERE rated_user_id = $1', [ratedUserId]);
        let avgStars = parseFloat(trustRows[0].avg_stars);
        console.log('Avg Stars:', avgStars);

        let newTrustScore = Math.round((avgStars / 5) * 1000) / 10;
        console.log('New Trust Score:', newTrustScore);

        await sendRatingReceivedEmail(userRows[0].email, stars, newTrustScore);
        console.log('Sent email');

        process.exit(0);
    } catch (err) {
        console.error('TEST ERROR:', err);
        process.exit(1);
    }
}

testRate();
