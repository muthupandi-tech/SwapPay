const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'mysqlpandi',
    database: process.env.DB_NAME || 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

exports.submitFeedback = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    const { type, category, message, rating } = req.body;

    // Validation
    if (!type || !['feedback', 'issue'].includes(type)) {
        return res.status(400).json({ error: 'Invalid feedback type.' });
    }

    if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    if (message.length > 500) {
        return res.status(400).json({ error: 'Message exceeds 500 characters.' });
    }

    if (type === 'feedback' && (!rating || rating < 1 || rating > 5)) {
        return res.status(400).json({ error: 'Rating (1-5) is required for feedback.' });
    }

    try {
        const [result] = await pool.execute(
            'INSERT INTO feedbacks (user_id, type, category, message, rating) VALUES (?, ?, ?, ?, ?)',
            [userId, type, category || null, message.trim(), type === 'feedback' ? rating : null]
        );

        res.status(201).json({ success: true, message: 'Thanks for your feedback ❤️', feedbackId: result.insertId });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'An error occurred while submitting your feedback.' });
    }
};
