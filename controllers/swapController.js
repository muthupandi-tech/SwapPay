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
    const { type, amount, location, lat, lng } = req.body;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    if (!type || !amount || !location || lat === undefined || lng === undefined) {
        return res.status(400).json({ error: 'Type, amount, location, latitude, and longitude are required.' });
    }

    if (type !== 'need_cash' && type !== 'need_upi') {
        return res.status(400).json({ error: 'Invalid swap type.' });
    }

    try {
        const isPartialAllowed = req.body.allow_partial_match === true || req.body.allow_partial_match === 'true';
        const isPartnerSelection = req.body.allow_partner_selection === true || req.body.allow_partner_selection === 'true';
        const isAutoAcceptPerfect = req.body.auto_accept_perfect !== false && req.body.auto_accept_perfect !== 'false';
        const parsedAmount = parseFloat(amount);

        // 1. Insert the PARENT swap request initially
        const insertQuery = 'INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, lat, lng, status, allow_partial_match, allow_partner_selection, auto_accept_perfect) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await promisePool.execute(insertQuery, [userId, type, parsedAmount, parsedAmount, parsedAmount, location, lat, lng, 'open', isPartialAllowed, isPartnerSelection, isAutoAcceptPerfect]);
        const newParentSwapId = result.insertId;

        const oppositeType = type === 'need_cash' ? 'need_upi' : 'need_cash';
        let remainingNeeded = parsedAmount;
        let matchedChunks = [];
        let autoMatchProceed = !isPartnerSelection; // If false, we branch into candidate selection mapping

        // --- PARTNER SELECTION LOGIC ---
        if (isPartnerSelection) {
            let candidateQuery = `
                SELECT s.*, u.name as partner_name, u.email as partner_email,
                (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as partner_rating
                FROM swaps s 
                JOIN users u ON s.user_id = u.id
                WHERE s.status = 'open' 
                  AND s.type = ? 
                  AND s.user_id != ? 
                  AND s.remaining_amount > 0
            `;
            let queryParams = [oppositeType, userId];

            if (!isPartialAllowed) {
                candidateQuery += ` AND s.remaining_amount >= ? AND (s.allow_partial_match = TRUE OR s.remaining_amount = ?) `;
                queryParams.push(remainingNeeded, remainingNeeded);
            } else {
                candidateQuery += ` AND (s.allow_partial_match = TRUE OR s.remaining_amount <= ?) `;
                queryParams.push(remainingNeeded);
            }

            candidateQuery += ` ORDER BY CASE WHEN s.remaining_amount = ? THEN 1 ELSE 2 END, s.created_at ASC LIMIT 10`;
            queryParams.push(remainingNeeded);

            const [matchRows] = await promisePool.execute(candidateQuery, queryParams);

            if (matchRows.length > 0) {
                let perfectMatchIndex = matchRows.findIndex(r => parseFloat(r.remaining_amount) === remainingNeeded);

                if (isAutoAcceptPerfect && perfectMatchIndex !== -1) {
                    // Force the while loop to perform the standard auto-match mechanism
                    autoMatchProceed = true;
                } else {
                    // Do not auto-match. Just email the user the options and leave swap marked open.
                    let emailPartners = matchRows.map(r => ({
                        name: r.partner_name,
                        amount: r.remaining_amount,
                        rating: r.partner_rating,
                        location: r.location
                    }));

                    const [userRows] = await promisePool.execute('SELECT email FROM users WHERE id = ?', [userId]);
                    if (userRows.length > 0) {
                        const { sendMultiplePartnersAvailableEmail } = require('../utils/emailService');
                        await sendMultiplePartnersAvailableEmail(userRows[0].email, parsedAmount, emailPartners);
                    }

                    return res.status(201).json({
                        message: 'Swap request created. Multiple partners available for selection!',
                        swapId: newParentSwapId,
                        isAutoMatched: false,
                        hasCandidates: true
                    });
                }
            }
        }

        // --- AUTO-MATCHING CROWD-SWAP LOGIC ---
        if (autoMatchProceed) {
            while (remainingNeeded > 0) {
                // Find an opposite open swap.
                // If our swap allows partial, we can match any other partial-allowed swap, OR fully absorb a non-partial swap.
                // If our swap DOES NOT allow partial, we can only match if the other swap's remaining amount exactly equals what we need OR is greater (if they allow partial).
                let candidateQuery = `
                    SELECT * FROM swaps 
                    WHERE status = 'open' 
                      AND type = ? 
                      AND user_id != ? 
                      AND remaining_amount > 0
                `;
                let queryParams = [oppositeType, userId];

                if (!isPartialAllowed) {
                    candidateQuery += ` AND remaining_amount >= ? `;
                    candidateQuery += ` AND (allow_partial_match = TRUE OR remaining_amount = ?) `;
                    queryParams.push(remainingNeeded, remainingNeeded);
                } else {
                    candidateQuery += ` AND (allow_partial_match = TRUE OR remaining_amount <= ?) `;
                    queryParams.push(remainingNeeded);
                }

                candidateQuery += ` ORDER BY created_at ASC LIMIT 1`;

                const [matchRows] = await promisePool.execute(candidateQuery, queryParams);

                if (matchRows.length === 0) {
                    break; // No more suitable matches found
                }

                const candidate = matchRows[0];
                const candidateRemaining = parseFloat(candidate.remaining_amount);

                // Calculate how much we can swap
                let chunkAmount = Math.min(remainingNeeded, candidateRemaining);

                // Update Candidate Parent Swap
                const newCandidateRemaining = candidateRemaining - chunkAmount;
                const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'open';

                await promisePool.execute(
                    'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = \'matched\', NOW(), match_time) WHERE id = ?',
                    [newCandidateRemaining, candidateStatus, candidateStatus, candidate.id]
                );

                // Create CHILD SWAP representing the exact match chunk
                const [childResult] = await promisePool.execute(`
                    INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, lat, lng, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
                `, [
                    userId, type, chunkAmount, chunkAmount, 0, location, lat, lng, 'matched', candidate.user_id, newParentSwapId, candidate.id
                ]);

                matchedChunks.push({
                    partnerId: candidate.user_id,
                    chunkAmount: chunkAmount,
                    childSwapId: childResult.insertId,
                    candidateParentId: candidate.id,
                    remainingNeededAfter: remainingNeeded - chunkAmount
                });

                remainingNeeded -= chunkAmount;

                if (!isPartialAllowed && remainingNeeded <= 0) {
                    break;
                }
            }

            // Update Our Parent Swap based on what was matched
            const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'open';
            await promisePool.execute(
                'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = \'matched\', NOW(), match_time) WHERE id = ?',
                [remainingNeeded, finalParentStatus, finalParentStatus, newParentSwapId]
            );

            // --- Post-Match Notifications & Emails ---
            // We will process all chunks matched
            if (matchedChunks.length > 0) {
                const { sendPartialMatchEmail } = require('../utils/emailService');

                for (const chunk of matchedChunks) {
                    const partnerId = chunk.partnerId;
                    const chunkAmt = chunk.chunkAmount;

                    // Notifications
                    const msg = `Match Found! ₹${chunkAmt} of your request has been matched with a partner!`;
                    await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [userId, 'Partial Match', msg, 'match']);
                    await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [partnerId, 'Partial Match', msg, 'match']);

                    if (global.io) {
                        global.io.to(`user_${userId}`).emit('notification', { title: 'Partial Match', message: msg, type: 'match', created_at: new Date() });
                        global.io.to(`user_${partnerId}`).emit('notification', { title: 'Partial Match', message: msg, type: 'match', created_at: new Date() });
                        global.io.emit('admin_activity', { event: 'Crowd-Swap Match', swapId: chunk.childSwapId, details: `Child Swap #${chunk.childSwapId} created for ₹${chunkAmt}.` });
                    }

                    // Emails
                    (async () => {
                        try {
                            const [meRows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);
                            const [partnerRows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [partnerId]);

                            if (meRows.length > 0 && partnerRows.length > 0) {
                                const me = meRows[0];
                                const partner = partnerRows[0];

                                // Our remaining is remainingNeededAfter
                                await sendPartialMatchEmail(me.email, chunkAmt, chunk.remainingNeededAfter, partner.name, type === 'need_cash' ? 'Need Cash' : 'Need UPI', location);

                                // Partner remaining needs to pull from DB, but we know it's CandidateParent's remaining
                                const [pRow] = await promisePool.execute('SELECT remaining_amount FROM swaps WHERE id = ?', [chunk.candidateParentId]);
                                const partnerRem = pRow.length > 0 ? parseFloat(pRow[0].remaining_amount) : 0;
                                await sendPartialMatchEmail(partner.email, chunkAmt, partnerRem, me.name, oppositeType === 'need_cash' ? 'Need Cash' : 'Need UPI', location);
                            }
                        } catch (err) {
                            console.error('Error sending partial match emails', err);
                        }
                    })();
                }

                return res.status(201).json({
                    message: remainingNeeded <= 0 ? 'Request fully matched via Crowd-Swap!' : `Request partially matched! ₹${remainingNeeded} remaining.`,
                    swapId: newParentSwapId,
                    isAutoMatched: true,
                    chunks: matchedChunks.length
                });
            }
        }

        // If no matches at all (or autoMatchProceed is false and no candidates found)
        try {
            const [userRows] = await promisePool.execute('SELECT email FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) {
                const { sendSwapCreatedEmail } = require('../utils/emailService');
                await sendSwapCreatedEmail(userRows[0].email, type, parsedAmount, location);
            }
        } catch (e) {
            console.error('Error sending create swap email', e);
        }

        return res.status(201).json({ message: 'Swap request created. Waiting for matches.', swapId: newParentSwapId, isAutoMatched: false });

    } catch (error) {
        console.error('Error creating/matching swap:', error);
        res.status(500).json({ error: 'An error occurred while matching or creating the swap.' });
    }
};

const geo = require('../utils/geo');

// Get all open swap requests (excluding the current user's own requests)
exports.getOpenSwaps = async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        // First get the user's location to calculate distance
        const [userRows] = await promisePool.execute('SELECT lat, lng FROM users WHERE id = ?', [userId]);
        const userLat = userRows[0]?.lat;
        const userLng = userRows[0]?.lng;

        // Note: If user hasn't set location, they shouldn't even see the swaps
        // But we'll return an empty array or handle error gently
        if (!userLat || !userLng) {
            return res.status(200).json([]); // Frontend will be showing location permission modal anyway
        }

        // Fetch open swaps and join with users table to get the requester's name AND average rating
        const query = `
            SELECT s.id, s.type, s.amount, s.location, s.lat, s.lng, s.created_at, u.name as requester_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = s.user_id) as requester_rating
            FROM swaps s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.status = 'open' AND s.user_id != ? 
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId]);

        // Filter and map to include distance
        const enhancedRows = [];
        for (const swap of rows) {
            if (swap.lat && swap.lng) {
                const distanceKm = geo.getDistanceInKm(userLat, userLng, swap.lat, swap.lng);
                // Also verify swap is strictly within campus radius
                if (geo.isInsideCampus(swap.lat, swap.lng)) {
                    enhancedRows.push({
                        ...swap,
                        distanceKm: distanceKm.toFixed(2) // Format to 2 decimal places
                    });
                }
            }
        }

        // Sort by closest distance
        enhancedRows.sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm));

        res.status(200).json(enhancedRows);
    } catch (error) {
        console.error('Error fetching swaps:', error);
        res.status(500).json({ error: 'An error occurred while fetching swaps.' });
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
        const checkQuery = 'SELECT status, user_id, matched_user_id, creator_completed, acceptor_completed, amount, parent_swap_id, matched_parent_swap_id FROM swaps WHERE id = ?';
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

            // Propagate completion to parent swaps (Crowd-Swap containers)
            const parentIds = [swap.parent_swap_id, swap.matched_parent_swap_id].filter(id => id != null);
            for (const pid of parentIds) {
                const [pRows] = await promisePool.execute('SELECT remaining_amount FROM swaps WHERE id = ?', [pid]);
                if (pRows.length > 0 && parseFloat(pRows[0].remaining_amount) === 0) {
                    const [cRows] = await promisePool.execute(
                        'SELECT id FROM swaps WHERE (parent_swap_id = ? OR matched_parent_swap_id = ?) AND status != "completed"',
                        [pid, pid]
                    );
                    if (cRows.length === 0) {
                        await promisePool.execute('UPDATE swaps SET status = "completed" WHERE id = ?', [pid]);
                    }
                }
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
            SELECT s.id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.created_at, s.user_id, s.matched_user_id,
            s.creator_completed, s.acceptor_completed, s.parent_swap_id, s.matched_parent_swap_id,
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

// Fetch available partners for a specific open swap
exports.getAvailablePartners = async (req, res) => {
    const userId = req.session.userId;
    const swapId = req.params.id;

    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    try {
        const [swapRows] = await promisePool.execute('SELECT type, remaining_amount, allow_partial_match, status FROM swaps WHERE id = ? AND user_id = ?', [swapId, userId]);
        if (swapRows.length === 0) return res.status(404).json({ error: 'Swap not found or unauthorized.' });

        const mySwap = swapRows[0];
        if (mySwap.status !== 'open') return res.status(400).json({ error: 'Swap is no longer open.' });

        const oppositeType = mySwap.type === 'need_cash' ? 'need_upi' : 'need_cash';
        let remainingNeeded = parseFloat(mySwap.remaining_amount);

        let candidateQuery = `
            SELECT s.*, u.name as partner_name, u.email as partner_email,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as partner_rating
            FROM swaps s 
            JOIN users u ON s.user_id = u.id
            WHERE s.status = 'open' 
              AND s.type = ? 
              AND s.user_id != ? 
              AND s.remaining_amount > 0
        `;
        let queryParams = [oppositeType, userId];

        if (!mySwap.allow_partial_match) {
            candidateQuery += ` AND s.remaining_amount >= ? AND (s.allow_partial_match = TRUE OR s.remaining_amount = ?) `;
            queryParams.push(remainingNeeded, remainingNeeded);
        } else {
            candidateQuery += ` AND (s.allow_partial_match = TRUE OR s.remaining_amount <= ?) `;
            queryParams.push(remainingNeeded);
        }

        candidateQuery += ` ORDER BY CASE WHEN s.remaining_amount = ? THEN 1 ELSE 2 END, s.created_at ASC LIMIT 10`;
        queryParams.push(remainingNeeded);

        const [matchRows] = await promisePool.execute(candidateQuery, queryParams);

        const candidates = matchRows.map(r => ({
            id: r.id,
            partner_name: r.partner_name,
            partner_rating: r.partner_rating,
            location: r.location,
            amount: parseFloat(r.remaining_amount)
        }));

        res.status(200).json(candidates);
    } catch (error) {
        console.error('Error fetching available partners:', error);
        res.status(500).json({ error: 'Failed to fetch partners.' });
    }
};

// Confirm selected partners and lock them
exports.confirmPartnerSelection = async (req, res) => {
    const userId = req.session.userId;
    const { swapId, selectedPartners } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    if (!selectedPartners || !Array.isArray(selectedPartners) || selectedPartners.length === 0) {
        return res.status(400).json({ error: 'No partners selected.' });
    }

    try {
        const [swapRows] = await promisePool.execute('SELECT type, remaining_amount, location, status FROM swaps WHERE id = ? AND user_id = ?', [swapId, userId]);
        if (swapRows.length === 0) return res.status(404).json({ error: 'Swap not found or unauthorized.' });

        const mySwap = swapRows[0];
        if (mySwap.status !== 'open') return res.status(400).json({ error: 'Swap is no longer open.' });

        let remainingNeeded = parseFloat(mySwap.remaining_amount);
        let selectionGroupId = 'GRP-' + Date.now();
        let matchedChunks = [];

        for (let i = 0; i < selectedPartners.length; i++) {
            const partner = selectedPartners[i];
            const candidateId = partner.id;
            const requestedChunk = parseFloat(partner.amount);

            if (remainingNeeded <= 0) break; // Safety net

            const [pRows] = await promisePool.execute('SELECT remaining_amount, user_id, status FROM swaps WHERE id = ? AND status = "open"', [candidateId]);
            if (pRows.length === 0) continue; // Partner was taken

            const candidateSwap = pRows[0];
            const candidateRemaining = parseFloat(candidateSwap.remaining_amount);

            let actualChunk = Math.min(requestedChunk, candidateRemaining, remainingNeeded);
            if (actualChunk <= 0) continue;

            const newCandidateRemaining = candidateRemaining - actualChunk;
            const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'open';

            await promisePool.execute(
                'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time), is_selected = TRUE, selection_group_id = ?, partner_priority_rank = ? WHERE id = ?',
                [newCandidateRemaining, candidateStatus, candidateStatus, selectionGroupId, i + 1, candidateId]
            );

            const [childResult] = await promisePool.execute(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
            `, [
                userId, mySwap.type, actualChunk, actualChunk, 0, mySwap.location, 'matched', candidateSwap.user_id, swapId, candidateId
            ]);

            matchedChunks.push({
                partnerId: candidateSwap.user_id,
                chunkAmount: actualChunk,
                childSwapId: childResult.insertId,
                candidateParentId: candidateId,
                remainingNeededAfter: remainingNeeded - actualChunk
            });

            remainingNeeded -= actualChunk;
        }

        const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'open';
        await promisePool.execute(
            'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time) WHERE id = ?',
            [remainingNeeded, finalParentStatus, finalParentStatus, swapId]
        );

        if (matchedChunks.length > 0) {
            const { sendPartialMatchEmail } = require('../utils/emailService');
            for (const chunk of matchedChunks) {
                const pId = chunk.partnerId;
                const chunkAmt = chunk.chunkAmount;

                const msg = `Match Confirmed! ₹${chunkAmt} of a swap request has been locked with you!`;
                await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [userId, 'Partner Selected', msg, 'match']);
                await promisePool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [pId, 'Partner Selected', msg, 'match']);

                if (global.io) {
                    global.io.to(`user_${userId}`).emit('notification', { title: 'Partner Selected', message: msg, type: 'match', created_at: new Date() });
                    global.io.to(`user_${pId}`).emit('notification', { title: 'Partner Selected', message: msg, type: 'match', created_at: new Date() });
                }

                (async () => {
                    try {
                        const [meRows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);
                        const [partnerRows] = await promisePool.execute('SELECT email, name FROM users WHERE id = ?', [pId]);

                        if (meRows.length > 0 && partnerRows.length > 0) {
                            const me = meRows[0];
                            const partner = partnerRows[0];
                            const oppositeType = mySwap.type === 'need_cash' ? 'need_upi' : 'need_cash';

                            await sendPartialMatchEmail(me.email, chunkAmt, chunk.remainingNeededAfter, partner.name, mySwap.type === 'need_cash' ? 'Need Cash' : 'Need UPI', mySwap.location);

                            const [pRow] = await promisePool.execute('SELECT remaining_amount FROM swaps WHERE id = ?', [chunk.candidateParentId]);
                            const partnerRem = pRow.length > 0 ? parseFloat(pRow[0].remaining_amount) : 0;
                            await sendPartialMatchEmail(partner.email, chunkAmt, partnerRem, me.name, oppositeType === 'need_cash' ? 'Need Cash' : 'Need UPI', mySwap.location);
                        }
                    } catch (err) {
                        console.error('Error sending confirming emails', err);
                    }
                })();
            }
        }

        res.status(200).json({
            message: 'Partners successfully confirmed and locked.',
            lockedChunks: matchedChunks.length,
            remainingNeeded: remainingNeeded
        });

    } catch (error) {
        console.error('Error confirming partners:', error);
        res.status(500).json({ error: 'Failed to confirm partners.' });
    }
};
