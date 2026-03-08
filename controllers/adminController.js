const mysql = require('mysql2');
const { generateReportPDF } = require('../utils/reportGenerator');

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

exports.getStats = async (req, res) => {
    try {
        const [userRows] = await promisePool.execute("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const [swapRows] = await promisePool.execute("SELECT COUNT(*) as count FROM swaps");
        const [compRows] = await promisePool.execute("SELECT COUNT(*) as count FROM swaps WHERE status = 'completed'");
        const [amtRows] = await promisePool.execute("SELECT SUM(amount) as total FROM swaps WHERE status = 'completed'");
        const [ratingRows] = await promisePool.execute("SELECT AVG(stars) as avg FROM ratings");

        res.json({
            usersCount: userRows[0].count,
            totalSwaps: swapRows[0].count,
            completedSwaps: compRows[0].count,
            totalExchanged: parseFloat(amtRows[0].total) || 0,
            avgRating: parseFloat(ratingRows[0].avg) || 0
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ error: 'Failed to fetch admin stats.' });
    }
};

exports.generateReport = async (req, res) => {
    try {
        // As requested: "For now, use sample statistics. Later we will replace them with real database queries."
        const sampleStats = {
            usersCount: 154,
            totalSwaps: 89,
            completedSwaps: 42,
            totalExchanged: 25400,
            avgRating: 4.8
        };

        generateReportPDF(sampleStats, res);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
};

exports.getAllSwaps = async (req, res) => {
    try {
        const query = `
            SELECT s.*, u1.name as creator_name, u2.name as matched_name 
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching admin swaps:', error);
        res.status(500).json({ error: 'Failed to fetch swaps.' });
    }
};

exports.deleteSwap = async (req, res) => {
    try {
        const { id } = req.params;
        await promisePool.execute('DELETE FROM swaps WHERE id = ?', [id]);
        res.json({ message: 'Swap deleted successfully' });
    } catch (error) {
        console.error('Error deleting swap:', error);
        res.status(500).json({ error: 'Failed to delete swap.' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.name, u.email, u.college, u.is_blocked, u.created_at,
                   (SELECT COUNT(*) FROM swaps WHERE user_id = u.id OR matched_user_id = u.id) as total_swaps,
                   (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as avg_rating
            FROM users u
            WHERE u.role = 'user'
            ORDER BY u.created_at DESC
        `;
        const [rows] = await promisePool.execute(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching admin users:', error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
};

exports.blockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const [user] = await promisePool.execute('SELECT is_blocked FROM users WHERE id = ?', [id]);
        if (user.length === 0) return res.status(404).json({ error: 'User not found' });

        const newStatus = !user[0].is_blocked;
        await promisePool.execute('UPDATE users SET is_blocked = ? WHERE id = ?', [newStatus, id]);

        const title = 'Account Status Update';
        const type = 'admin';
        const msg = newStatus ? 'Your account has been temporarily blocked by an Admin.' : 'Your account has been unblocked by an Admin.';

        await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [id, title, msg, type]);

        if (global.io) {
            global.io.to(`user_${id}`).emit('notification', {
                title, message: msg, type, created_at: new Date()
            });
        }
        res.json({ message: `User successfully ${newStatus ? 'blocked' : 'unblocked'}` });
    } catch (error) {
        console.error('Error blocking user:', error);
        res.status(500).json({ error: 'Failed to block user.' });
    }
};

exports.getSettings = async (req, res) => {
    try {
        const [rows] = await promisePool.execute("SELECT setting_key, setting_value FROM settings");
        const settings = {};
        rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings.' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            return res.status(400).json({ error: 'Setting key and value are required.' });
        }

        await promisePool.execute("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?", [key, value, value]);
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings.' });
    }
};
