const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay'
});

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.session.userId;
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.status(200).json(notifications);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const userId = req.session.userId;
        const notificationId = req.params.id;

        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (err) {
        console.error('Error updating notification:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.clearAll = async (req, res) => {
    try {
        const userId = req.session.userId;
        await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
        res.json({ success: true, message: 'All notifications cleared.' });
    } catch (err) {
        console.error('Error clearing notifications:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
