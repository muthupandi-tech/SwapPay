const mysql = require('mysql2');
const { sendSwapMatchedEmail, sendSwapCompletedEmail, sendRatingReceivedEmail } = require('../utils/emailService');

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

// Create a new swap request
exports.createSwap = async (req, res) => {
    const { type, amount, location } = req.body;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    if (!type || !amount || !location) {
        return res.status(400).json({ error: 'Type, amount, and location are required.' });
    }

    if (type !== 'need_cash' && type !== 'need_upi') {
        return res.status(400).json({ error: 'Invalid swap type.' });
    }

    try {
        const query = 'INSERT INTO swaps (user_id, type, amount, location, status) VALUES (?, ?, ?, ?, ?)';
        const [result] = await promisePool.execute(query, [userId, type, amount, location, 'open']);

        // Send Email Notification
        try {
            const [userRows] = await promisePool.execute('SELECT email FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) {
                const { sendSwapCreatedEmail } = require('../utils/emailService');
                await sendSwapCreatedEmail(userRows[0].email, type, amount, location);
            }
        } catch (e) {
            console.error('Error sending create swap email', e);
        }

        res.status(201).json({ message: 'Swap request created successfully.', swapId: result.insertId });
    } catch (error) {
        console.error('Error creating swap:', error);
        res.status(500).json({ error: 'An error occurred while creating the swap.' });
    }
};

// Get all open swap requests (excluding the current user's own requests)
exports.getOpenSwaps = async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        // Fetch open swaps and join with users table to get the requester's name AND average rating
        const query = `
            SELECT s.id, s.type, s.amount, s.location, s.created_at, u.name as requester_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = s.user_id) as requester_rating
            FROM swaps s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.status = 'open' AND s.user_id != ? 
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId]);

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching swaps:', error);
        res.status(500).json({ error: 'An error occurred while fetching swaps.' });
    }
};

// Accept a swap request
exports.acceptSwap = async (req, res) => {
    const swapId = req.params.id;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        // First check if the swap is still open
        const checkQuery = 'SELECT * FROM swaps WHERE id = ?';
        const [rows] = await promisePool.execute(checkQuery, [swapId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Swap request not found.' });
        }

        if (rows[0].status !== 'open') {
            return res.status(400).json({ error: 'This swap request has already been accepted or completed.' });
        }

        if (rows[0].user_id === userId) {
            return res.status(400).json({ error: 'You cannot accept your own swap request.' });
        }

        // Update the swap status to 'matched', save matched_user_id, and set match_time
        const updateQuery = 'UPDATE swaps SET status = ?, matched_user_id = ?, match_time = NOW() WHERE id = ?';
        await promisePool.execute(updateQuery, ['matched', userId, swapId]);

        // Send Notification to original user
        const originalUserId = rows[0].user_id;
        const msg = `Your swap request has been matched! Please proceed to the meeting location.`;
        const title = 'Swap Matched';
        const type = 'match';
        await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [originalUserId, title, msg, type]);

        // Emit Socket Event
        if (global.io) {
            global.io.to(`user_${originalUserId}`).emit('notification', {
                title, message: msg, type, created_at: new Date()
            });
            global.io.emit('admin_activity', {
                event: 'Swap Matched',
                swapId,
                details: `Swap #${swapId} was matched.`
            });
        }

        // Email Notification
        // Wrapping in self-executing async to not block the current request process
        (async () => {
            try {
                const [creatorRows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [originalUserId]);
                const [acceptorRows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);

                if (creatorRows.length > 0 && acceptorRows.length > 0) {
                    const creator = creatorRows[0];
                    const acceptor = acceptorRows[0];
                    const { type, amount, location } = rows[0];

                    const { sendSwapMatchedEmail } = require('../utils/emailService');

                    // 1. Send to the person who originally created the swap request
                    await sendSwapMatchedEmail(
                        creator.email,
                        creator.name,
                        acceptor.name,
                        acceptor.email,
                        type === 'need_cash' ? 'Need Cash' : 'Need UPI',
                        amount,
                        location
                    );

                    // 2. Send to the person who just clicked "Accept"
                    await sendSwapMatchedEmail(
                        acceptor.email,
                        acceptor.name,
                        creator.name,
                        creator.email,
                        type === 'need_cash' ? 'Need UPI' : 'Need Cash',
                        amount,
                        location
                    );
                }
            } catch (e) {
                console.error('Error in swap match email block:', e);
            }
        })();

        // In a real application, you might insert a record into a `matches` table here
        // linking the original user_id and the accepting userId.

        res.status(200).json({ message: 'Swap request accepted successfully.' });
    } catch (error) {
        console.error('Error accepting swap:', error);
        res.status(500).json({ error: 'An error occurred while accepting the swap.' });
    }
};

// Complete a swap request
exports.completeSwap = async (req, res) => {
    const swapId = req.params.id;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        const checkQuery = 'SELECT status, user_id, matched_user_id, creator_completed, acceptor_completed FROM swaps WHERE id = ?';
        const [rows] = await promisePool.execute(checkQuery, [swapId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Swap request not found.' });
        }

        const swap = rows[0];

        if (swap.status !== 'matched') {
            return res.status(400).json({ error: 'Only matched swaps can be completed.' });
        }

        // Allow either the creator or the matched user to complete
        if (swap.user_id !== userId && swap.matched_user_id !== userId) {
            return res.status(403).json({ error: 'You are not authorized to complete this swap.' });
        }

        // Determine who is clicking complete
        const isCreator = (swap.user_id === userId);

        // Update the specific flag
        const updateFlagQuery = isCreator
            ? 'UPDATE swaps SET creator_completed = TRUE WHERE id = ?'
            : 'UPDATE swaps SET acceptor_completed = TRUE WHERE id = ?';
        await promisePool.execute(updateFlagQuery, [swapId]);

        // Re-fetch to check if BOTH are now true
        const [updatedRows] = await promisePool.execute(checkQuery, [swapId]);
        const updatedSwap = updatedRows[0];

        if (updatedSwap.creator_completed && updatedSwap.acceptor_completed) {
            // Both have completed! Finalize it.
            const updateFinalQuery = 'UPDATE swaps SET status = ? WHERE id = ?';
            await promisePool.execute(updateFinalQuery, ['completed', swapId]);

            // Notify BOTH users
            const msg = `Swap exchange marked as completed! Don't forget to rate your partner.`;
            const title = 'Swap Completed';
            const type = 'completed';

            await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [swap.user_id, title, msg, type]);
            if (swap.matched_user_id) {
                await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [swap.matched_user_id, title, msg, type]);
            }

            // Emit Socket Events
            if (global.io) {
                global.io.to(`user_${swap.user_id}`).emit('notification', {
                    title, message: msg, type, created_at: new Date()
                });
                if (swap.matched_user_id) {
                    global.io.to(`user_${swap.matched_user_id}`).emit('notification', {
                        title, message: msg, type, created_at: new Date()
                    });
                }
                global.io.emit('admin_activity', {
                    event: 'Swap Completed',
                    swapId,
                    details: `Swap #${swapId} marked as successfully completed by both users.`
                });
            }

            // Email Notification
            try {
                const [u1Rows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [swap.user_id]);
                const [u2Rows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [swap.matched_user_id]);

                if (u1Rows.length > 0 && u2Rows.length > 0) {
                    const { sendSwapCompletedEmail } = require('../utils/emailService');
                    // Send to creator
                    await sendSwapCompletedEmail(u1Rows[0].email, u2Rows[0].name, swap.amount);
                    // Send to matcher
                    await sendSwapCompletedEmail(u2Rows[0].email, u1Rows[0].name, swap.amount);
                }
            } catch (e) {
                console.error('Error sending completion emails:', e);
            }

            return res.status(200).json({ message: 'Swap marked as completed by both parties.' });
        } else {
            // Only one has completed, waiting for partner
            return res.status(200).json({ message: 'Marked as completed. Waiting for partner to confirm.' });
        }
    } catch (error) {
        console.error('Error completing swap:', error);
        res.status(500).json({ error: 'An error occurred while completing the swap.' });
    }
};

// Get Dashboard Statistics
exports.getDashboardStats = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    try {
        // Active Swaps: swaps with status open or matched involving the user
        const activeSwapsQuery = `
            SELECT COUNT(*) AS count 
            FROM swaps 
            WHERE (user_id = ? OR matched_user_id = ?) 
              AND status IN ('open', 'matched')
        `;
        const [activeRows] = await promisePool.execute(activeSwapsQuery, [userId, userId]);
        const activeSwaps = activeRows[0].count;

        // Total Exchanged: sum of amounts where status completed
        const exchangedQuery = `
            SELECT COALESCE(SUM(amount), 0) AS total 
            FROM swaps 
            WHERE (user_id = ? OR matched_user_id = ?) 
              AND status = 'completed'
        `;
        const [exchangedRows] = await promisePool.execute(exchangedQuery, [userId, userId]);
        const totalExchanged = parseFloat(exchangedRows[0].total) || 0;

        // Trust Score: Based on ratings
        const trustQuery = `
            SELECT AVG(stars) AS avg_stars
            FROM ratings 
            WHERE rated_user_id = ?
        `;
        const [trustRows] = await promisePool.execute(trustQuery, [userId]);
        const avgStars = parseFloat(trustRows[0].avg_stars);

        let trustScoreNum = 100;
        if (!isNaN(avgStars)) {
            // Convert to percentage: (average_stars / 5) * 100
            trustScoreNum = (avgStars / 5) * 100;
        }

        trustScoreNum = Math.round(trustScoreNum * 10) / 10;
        const trustScore = `${trustScoreNum}%`;

        // Include user role for frontend logic
        const role = req.session.role || 'user';

        res.status(200).json({ activeSwaps, totalExchanged, trustScore, role });
    } catch (error) {
        console.error('Error calculating stats:', error);
        res.status(500).json({ error: 'An error occurred while fetching dashboard stats.' });
    }
};

// Get the current user's swaps (open, matched, completed)
exports.getMySwaps = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    try {
        const query = `
            SELECT s.id, s.type, s.amount, s.location, s.status, s.created_at, s.user_id, s.matched_user_id,
            s.creator_completed, s.acceptor_completed,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE s.user_id = ? OR s.matched_user_id = ?
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId, userId]);

        // Add context for the frontend
        const swapsWithContext = rows.map(swap => {
            return {
                ...swap,
                // Determine if the logged in user is the creator
                isCreator: swap.user_id === userId,
                // Easy access to the "other" party's name
                otherPartyName: swap.user_id === userId ? (swap.matched_name || 'Waiting...') : swap.creator_name,
                otherPartyId: swap.user_id === userId ? swap.matched_user_id : swap.user_id,
                // Add the relevant rating based on who created vs matched
                otherPartyRating: swap.user_id === userId ? swap.matched_rating : swap.creator_rating
            };
        });

        res.status(200).json(swapsWithContext);
    } catch (error) {
        console.error('Error fetching my swaps:', error);
        res.status(500).json({ error: 'An error occurred while fetching your swaps.' });
    }
};

// Rate a Swap Partner
exports.rateSwap = async (req, res) => {
    const swapId = req.params.id;
    const userId = req.session.userId;
    const { stars } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    if (!stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'Please provide a star rating between 1 and 5.' });
    }

    try {
        const checkQuery = 'SELECT status, user_id, matched_user_id FROM swaps WHERE id = ?';
        const [rows] = await promisePool.execute(checkQuery, [swapId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Swap request not found.' });
        }

        const swap = rows[0];

        if (swap.status !== 'completed') {
            return res.status(400).json({ error: 'Only completed swaps can be rated.' });
        }

        if (swap.user_id !== userId && swap.matched_user_id !== userId) {
            return res.status(403).json({ error: 'You are not authorized to rate this swap.' });
        }

        // Determine the ID of the user being rated (the "other" user)
        const ratedUserId = swap.user_id === userId ? swap.matched_user_id : swap.user_id;

        // Check if user already rated this swap
        const ratingCheckQuery = 'SELECT id FROM ratings WHERE swap_id = ? AND rater_user_id = ?';
        const [ratingRows] = await promisePool.execute(ratingCheckQuery, [swapId, userId]);

        if (ratingRows.length > 0) {
            return res.status(400).json({ error: 'You have already rated this swap.' });
        }

        const insertQuery = 'INSERT INTO ratings (swap_id, rater_user_id, rated_user_id, stars) VALUES (?, ?, ?, ?)';
        await promisePool.execute(insertQuery, [swapId, userId, ratedUserId, stars]);

        // Notify Rated User
        const msg = `You received a ${stars}-star rating from your recent swap partner.`;
        const title = 'New Rating';
        const type = 'rating';
        await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [ratedUserId, title, msg, type]);

        // Emit Socket Event
        if (global.io) {
            global.io.to(`user_${ratedUserId}`).emit('notification', {
                title, message: msg, type, created_at: new Date()
            });
        }

        // Email Notification
        try {
            const [userRows] = await promisePool.execute('SELECT email FROM users WHERE id = ?', [ratedUserId]);
            if (userRows.length > 0) {
                // Calculate new trust score
                const trustQuery = `SELECT AVG(stars) AS avg_stars FROM ratings WHERE rated_user_id = ?`;
                const [trustRows] = await promisePool.execute(trustQuery, [ratedUserId]);
                let avgStars = parseFloat(trustRows[0].avg_stars);
                let newTrustScore = 100;
                if (!isNaN(avgStars)) {
                    newTrustScore = Math.round((avgStars / 5) * 1000) / 10;
                }
                await sendRatingReceivedEmail(userRows[0].email, stars, newTrustScore);
            }
        } catch (e) { console.error('Error in email block', e) }

        res.status(200).json({ message: 'Rating submitted successfully.' });

    } catch (error) {
        console.error('Error submitting rating:', error);
        res.status(500).json({ error: 'An error occurred while submitting the rating.' });
    }
};

// Fetch User Notifications
exports.getNotifications = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    try {
        const query = 'SELECT id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50';
        const [rows] = await promisePool.execute(query, [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
};

// Mark Notification as Read
exports.markNotificationRead = async (req, res) => {
    const userId = req.session.userId;
    const notifId = req.params.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    try {
        const query = 'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?';
        await promisePool.execute(query, [notifId, userId]);
        res.status(200).json({ message: 'Notification marked as read.' });
    } catch (error) {
        console.error('Error marking notification read:', error);
        res.status(500).json({ error: 'Failed to update notification.' });
    }
};
