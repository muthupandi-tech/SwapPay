// const mysql = require('mysql2');
const { Pool } = require('pg');
const { generateReportPDF } = require('../utils/reportGenerator');
const { sendIssueResolvedEmail, sendFeedbackReplyEmail } = require('../utils/emailService');
const pool = require('../config/db');

exports.getStats = async (req, res) => {
    try {
        // const [userRows] = await pool.execute("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const { rows: userRows } = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        
        // const [swapRows] = await pool.execute("SELECT COUNT(*) as count FROM swaps");
        const { rows: swapRows } = await pool.query("SELECT COUNT(*) as count FROM swaps");
        
        // const [compRows] = await pool.execute("SELECT COUNT(*) as count FROM swaps WHERE status = 'completed'");
        const { rows: compRows } = await pool.query("SELECT COUNT(*) as count FROM swaps WHERE status = 'completed'");
        
        // const [amtRows] = await pool.execute("SELECT SUM(amount) as total FROM swaps WHERE status = 'completed'");
        const { rows: amtRows } = await pool.query("SELECT SUM(amount) as total FROM swaps WHERE status = 'completed'");
        
        // const [ratingRows] = await pool.execute("SELECT AVG(stars) as avg FROM ratings");
        const { rows: ratingRows } = await pool.query("SELECT AVG(stars) as avg FROM ratings");

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
        // 1. Overall Statistics
        // const [totalUserRows] = await pool.execute("SELECT COUNT(*) as count FROM users");
        const { rows: totalUserRows } = await pool.query("SELECT COUNT(*) as count FROM users");
        
        // const [userRows] = await pool.execute("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const { rows: userRows } = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        
        // const [swapRows] = await pool.execute("SELECT COUNT(*) as count FROM swaps");
        const { rows: swapRows } = await pool.query("SELECT COUNT(*) as count FROM swaps");
        
        // const [compRows] = await pool.execute("SELECT COUNT(*) as count FROM swaps WHERE status = 'completed'");
        const { rows: compRows } = await pool.query("SELECT COUNT(*) as count FROM swaps WHERE status = 'completed'");
        
        // const [amtRows] = await pool.execute("SELECT SUM(amount) as total FROM swaps WHERE status = 'completed'");
        const { rows: amtRows } = await pool.query("SELECT SUM(amount) as total FROM swaps WHERE status = 'completed'");
        
        // const [ratingRows] = await pool.execute("SELECT AVG(stars) as avg FROM ratings");
        const { rows: ratingRows } = await pool.query("SELECT AVG(stars) as avg FROM ratings");

        // 2. Comprehensive 14-Day Activity Pulse
        /*
        const dailyQuery = `
            SELECT 
                d.report_date,
                COALESCE(u.new_users, 0) as new_users,
                COALESCE(s.pending_count, 0) as pending_count,
                COALESCE(s.completed_count, 0) as completed_count,
                COALESCE(s.total_amount, 0) as total_amount,
                COALESCE(r.avg_rating, 0) as avg_rating
            FROM (
                SELECT CURDATE() - INTERVAL (n.n) DAY AS report_date
                FROM (
                    SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 
                    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 
                    UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13
                ) n
            ) d
            LEFT JOIN (
                SELECT DATE(created_at) as date, COUNT(*) as new_users FROM users WHERE role = 'user' GROUP BY DATE(created_at)
            ) u ON d.report_date = u.date
            LEFT JOIN (
                SELECT 
                    DATE(created_at) as date, 
                    SUM(CASE WHEN status IN ('open', 'matched') THEN 1 ELSE 0 END) as pending_count,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                    SUM(amount) as total_amount
                FROM swaps 
                GROUP BY DATE(created_at)
            ) s ON d.report_date = s.date
            LEFT JOIN (
                SELECT DATE(created_at) as date, AVG(stars) as avg_rating FROM ratings GROUP BY DATE(created_at)
            ) r ON d.report_date = r.date
            ORDER BY d.report_date DESC
        `;
        const [dailyRows] = await pool.execute(dailyQuery);
        */
        const dailyQueryPostgres = `
            SELECT 
                d.report_date,
                COALESCE(u.new_users, 0) as new_users,
                COALESCE(s.pending_count, 0) as pending_count,
                COALESCE(s.completed_count, 0) as completed_count,
                COALESCE(s.total_amount, 0) as total_amount,
                COALESCE(r.avg_rating, 0) as avg_rating
            FROM (
                SELECT (CURRENT_DATE - (n || ' day')::INTERVAL)::DATE AS report_date
                FROM generate_series(0, 13) n
            ) d
            LEFT JOIN (
                SELECT created_at::DATE as date, COUNT(*) as new_users FROM users WHERE role = 'user' GROUP BY created_at::DATE
            ) u ON d.report_date = u.date
            LEFT JOIN (
                SELECT 
                    created_at::DATE as date, 
                    SUM(CASE WHEN status IN ('open', 'matched') THEN 1 ELSE 0 END) as pending_count,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                    SUM(amount) as total_amount
                FROM swaps 
                GROUP BY created_at::DATE
            ) s ON d.report_date = s.date
            LEFT JOIN (
                SELECT created_at::DATE as date, AVG(stars) as avg_rating FROM ratings GROUP BY created_at::DATE
            ) r ON d.report_date = r.date
            ORDER BY d.report_date DESC
        `;
        const { rows: dailyRows } = await pool.query(dailyQueryPostgres);

        // 3. Feedback Status Summary
        /*
        const feedbackSummaryQuery = `
            SELECT status, COUNT(*) as count 
            FROM feedbacks 
            GROUP BY status
        `;
        const [feedbackSummaryRows] = await pool.execute(feedbackSummaryQuery);
        */
        const feedbackSummaryQuery = `
            SELECT status, COUNT(*) as count 
            FROM feedbacks 
            GROUP BY status
        `;
        const { rows: feedbackSummaryRows } = await pool.query(feedbackSummaryQuery);

        // 4. Detailed Recent Issues (Latest 10)
        /*
        const feedbackDetailQuery = `
            SELECT f.message, f.status, f.type, u.name as user_name, f.created_at
            FROM feedbacks f 
            JOIN users u ON f.user_id = u.id 
            ORDER BY f.created_at DESC 
            LIMIT 10
        `;
        const [feedbackDetailRows] = await pool.execute(feedbackDetailQuery);
        */
        const feedbackDetailQuery = `
            SELECT f.message, f.status, f.type, u.name as user_name, f.created_at
            FROM feedbacks f 
            JOIN users u ON f.user_id = u.id 
            ORDER BY f.created_at DESC 
            LIMIT 10
        `;
        const { rows: feedbackDetailRows } = await pool.query(feedbackDetailQuery);

        const stats = {
            totalUsersCount: totalUserRows[0].count,
            usersCount: userRows[0].count,
            totalSwaps: swapRows[0].count,
            completedSwaps: compRows[0].count,
            totalExchanged: parseFloat(amtRows[0].total) || 0,
            avgRating: parseFloat(ratingRows[0].avg) || 0,
            dailyActivity: dailyRows,
            feedbackSummary: feedbackSummaryRows,
            feedbackDetails: feedbackDetailRows
        };

        generateReportPDF(stats, res);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
};

exports.getAllSwaps = async (req, res) => {
    try {
        const query = `
            SELECT s.id, s.user_id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.matched_user_id, s.match_time, s.parent_swap_id, s.matched_parent_swap_id, s.lat, s.lng, s.completed_at, s.created_at, s.is_edited,
            u1.name as creator_name, u2.name as matched_name 
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            ORDER BY s.created_at DESC
        `;
        // const [rows] = await pool.execute(query);
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching admin swaps:', error);
        res.status(500).json({ error: 'Failed to fetch swaps.' });
    }
};

exports.deleteSwap = async (req, res) => {
    try {
        const { id } = req.params;
        // await pool.execute('DELETE FROM swaps WHERE id = ?', [id]);
        await pool.query('DELETE FROM swaps WHERE id = $1', [id]);
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
        // const [rows] = await pool.execute(query);
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching admin users:', error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
};

exports.blockUser = async (req, res) => {
    try {
        const { id } = req.params;
        // const [user] = await pool.execute('SELECT is_blocked FROM users WHERE id = ?', [id]);
        const { rows: user } = await pool.query('SELECT is_blocked FROM users WHERE id = $1', [id]);
        if (user.length === 0) return res.status(404).json({ error: 'User not found' });

        const newStatus = !user[0].is_blocked;
        // await pool.execute('UPDATE users SET is_blocked = ? WHERE id = ?', [newStatus, id]);
        await pool.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [newStatus, id]);

        const title = 'Account Status Update';
        const type = 'admin';
        const msg = newStatus ? 'Your account has been temporarily blocked by an Admin.' : 'Your account has been unblocked by an Admin.';

        // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [id, title, msg, type]);
        await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [id, title, msg, type]);

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
        // const [rows] = await pool.execute("SELECT setting_key, setting_value FROM settings");
        const { rows } = await pool.query("SELECT setting_key, setting_value FROM settings");
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

        // await pool.execute("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?", [key, value, value]);
        await pool.query("INSERT INTO settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value", [key, value]);
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings.' });
    }
};

// --- Feedback Management ---

exports.getAllFeedbacks = async (req, res) => {
    try {
        const query = `
            SELECT f.*, u.name as user_name, u.email as user_email
            FROM feedbacks f
            JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
        `;
        // const [rows] = await pool.execute(query);
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching admin feedbacks:', error);
        res.status(500).json({ error: 'Failed to fetch feedbacks.' });
    }
};

exports.updateFeedbackStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status) return res.status(400).json({ error: 'Status is required' });

        // Get feedback and user details first
        const { rows: fbRows } = await pool.query(`
            SELECT f.*, u.email, u.name 
            FROM feedbacks f 
            JOIN users u ON f.user_id = u.id 
            WHERE f.id = $1
        `, [id]);

        if (fbRows.length === 0) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        const feedback = fbRows[0];

        // Update status
        await pool.query('UPDATE feedbacks SET status = $1 WHERE id = $2', [status, id]);

        // If status is 'resolved' and type is 'issue', send email
        if (status === 'resolved' && feedback.type === 'issue') {
            await sendIssueResolvedEmail(feedback.email, feedback.name);
        }

        // Real-time update via Socket.io
        if (global.io) {
            global.io.emit('feedback_status_updated', { id, status });
        }

        res.json({ message: `Feedback marked as ${status}` });
    } catch (error) {
        console.error('Error updating feedback status:', error);
        res.status(500).json({ error: 'Failed to update feedback status.' });
    }
};

exports.replyToFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const { replyMessage } = req.body;

        if (!replyMessage) return res.status(400).json({ error: 'Reply message is required' });

        // Get feedback and user details
        const { rows: fbRows } = await pool.query(`
            SELECT f.*, u.email, u.name 
            FROM feedbacks f 
            JOIN users u ON f.user_id = u.id 
            WHERE f.id = $1
        `, [id]);

        if (fbRows.length === 0) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        const feedback = fbRows[0];

        // Update feedback with reply
        await pool.query(
            'UPDATE feedbacks SET admin_reply = $1, status = $2, replied_at = NOW() WHERE id = $3',
            [replyMessage, 'replied', id]
        );

        // Send email reply
        await sendFeedbackReplyEmail(feedback.email, feedback.name, replyMessage);

        // Real-time update via Socket.io
        if (global.io) {
            global.io.emit('feedback_replied', { id, replyMessage, status: 'replied' });
        }

        res.json({ message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error replying to feedback:', error);
        res.status(500).json({ error: 'Failed to send reply.' });
    }
};

exports.deleteFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        // await pool.execute('DELETE FROM feedbacks WHERE id = ?', [id]);
        await pool.query('DELETE FROM feedbacks WHERE id = $1', [id]);
        res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).json({ error: 'Failed to delete feedback.' });
    }
};
