const mysql = require('mysql2');

// Database connection using the configured details
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

exports.getProfile = async (req, res) => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized route. Please login first.' });
        }

        // Fetch User details
        const [userRows] = await promisePool.execute(
            'SELECT id, name, phone, email, college, campus_name, lat, lng, block_name, role, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = userRows[0];

        // Total Swaps Completed
        const [swapRows] = await promisePool.execute(
            `SELECT COUNT(*) as completed_count 
             FROM swaps 
             WHERE status = 'completed' AND (user_id = ? OR matched_user_id = ?)`,
            [userId, userId]
        );
        const totalSwapsCompleted = swapRows[0].completed_count;

        // Trust Score & Ratings
        const [ratingRows] = await promisePool.execute(
            `SELECT r.stars, r.created_at, u.name as rater_name 
             FROM ratings r
             JOIN users u ON r.rater_user_id = u.id
             WHERE r.rated_user_id = ?
             ORDER BY r.created_at DESC`,
            [userId]
        );

        let trustScore = 100;
        let averageRating = 0;
        if (ratingRows.length > 0) {
            const sumStars = ratingRows.reduce((sum, r) => sum + r.stars, 0);
            averageRating = (sumStars / ratingRows.length).toFixed(1);

            // Calculate Trust Score (Base 100, drops by 5 for every point below 5 average)
            // If avg is 5 -> 100%
            // If avg is 4 -> 80% (approx)
            trustScore = Math.max(0, Math.round((averageRating / 5) * 100));
        }

        // Top 5 recent ratings
        const recentRatings = ratingRows.slice(0, 5);

        res.json({
            user,
            stats: {
                totalSwapsCompleted,
                trustScore: `${trustScore}%`,
                averageRating,
                totalRatings: ratingRows.length
            },
            recentRatings
        });

    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized route. Please login first.' });
        }

        const { name, phone, college } = req.body;

        if (!name || !phone || !college) {
            return res.status(400).json({ error: 'Name, phone, and college are required.' });
        }

        await promisePool.execute(
            'UPDATE users SET name = ?, phone = ?, college = ? WHERE id = ?',
            [name, phone, college, userId]
        );

        res.json({ message: 'Profile updated successfully.' });

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

const geo = require('../utils/geo');

exports.updateLocation = async (req, res) => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized route. Please login first.' });
        }

        const { lat, lng } = req.body;

        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Latitude and Longitude are required.' });
        }

        // Validate Geo-fence
        if (!geo.isInsideCampus(lat, lng)) {
            return res.status(403).json({ error: 'Selected location is outside the approved campus boundary.' });
        }

        await promisePool.execute(
            'UPDATE users SET lat = ?, lng = ?, campus_name = "Auto-Verified Campus" WHERE id = ?',
            [lat, lng, userId]
        );

        res.json({ message: 'Campus Location verified and saved successfully.' });

    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};
