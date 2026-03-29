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
            'SELECT id, name, phone, email, college, campus_name, lat, lng, block_name, role, auto_match, created_at FROM users WHERE id = ?',
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

exports.updateAutoMatch = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { autoMatch } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        if (autoMatch === undefined) {
            return res.status(400).json({ error: 'autoMatch value is required.' });
        }

        await promisePool.execute(
            'UPDATE users SET auto_match = ? WHERE id = ?',
            [autoMatch ? 1 : 0, userId]
        );

        res.json({ success: true, message: `Auto-Match turned ${autoMatch ? 'ON' : 'OFF'}.` });

    } catch (error) {
        console.error('Error updating auto-match:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

exports.getSettings = async (req, res) => {
    try {
        const userId = req.session.userId;
        const [rows] = await promisePool.execute(
            'SELECT auto_match, notification_sound, notification_vibration, notification_animation FROM users WHERE id = ?',
            [userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        
        const settings = {
            autoMatch: rows[0].auto_match === 1,
            sound: rows[0].notification_sound === 1,
            vibration: rows[0].notification_vibration === 1,
            animation: rows[0].notification_animation === 1
        };
        
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { autoMatch, sound, vibration, animation } = req.body;
        
        if (autoMatch === undefined || sound === undefined || vibration === undefined || animation === undefined) {
            return res.status(400).json({ error: 'All settings values are required.' });
        }
        
        await promisePool.execute(
            'UPDATE users SET auto_match = ?, notification_sound = ?, notification_vibration = ?, notification_animation = ? WHERE id = ?',
            [autoMatch ? 1 : 0, sound ? 1 : 0, vibration ? 1 : 0, animation ? 1 : 0, userId]
        );
        
        res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};
