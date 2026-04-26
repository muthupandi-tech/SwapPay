// const mysql = require('mysql2/promise');
const { Pool } = require('pg');

/*
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'mysqlpandi',
    database: process.env.DB_NAME || 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
*/

const pool = new Pool({
    host: "ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech",
    user: "neondb_owner",
    password: "npg_wX7MmeLB0FTU",
    database: "neondb",
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

const emailService = require('../utils/emailService');

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
        // Fetch user details for the email
        const { rows: userRows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [userId]);
        const user = userRows[0];

        const { rows } = await pool.query(
            'INSERT INTO feedbacks (user_id, type, category, message, rating) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, type, category || null, message.trim(), type === 'feedback' ? rating : null]
        );

        // Send email to admin asynchronously (don't block the response)
        if (user) {
            emailService.sendFeedbackEmailToAdmin(user.name, user.email, type, category, message.trim(), type === 'feedback' ? rating : null)
                .catch(err => console.error('Background Email Error:', err));
        }

        res.status(201).json({ success: true, message: 'Thanks for your feedback ❤️', feedbackId: rows[0].id });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'An error occurred while submitting your feedback.' });
    }
};
