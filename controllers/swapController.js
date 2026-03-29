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
        const isPartialAllowed = req.body.allow_partial_match === true || req.body.allow_partial_match === 'true';
        const isPartnerSelection = req.body.allow_partner_selection === true || req.body.allow_partner_selection === 'true';
        const isAutoAcceptPerfect = req.body.auto_accept_perfect !== false && req.body.auto_accept_perfect !== 'false';
        const parsedAmount = parseFloat(amount);

        // 1. Insert the PARENT swap request initially
        const insertQuery = 'INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match, allow_partner_selection, auto_accept_perfect) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await promisePool.execute(insertQuery, [userId, type, parsedAmount, parsedAmount, parsedAmount, location, 'active', isPartialAllowed, isPartnerSelection, isAutoAcceptPerfect]);
        const newParentSwapId = result.insertId;

        // --- NEW: Respect User's auto_match preference ---
        const [userRows] = await promisePool.execute('SELECT auto_match FROM users WHERE id = ?', [userId]);
        const userAutoMatch = userRows.length > 0 ? (userRows[0].auto_match === 1 || userRows[0].auto_match === true) : true;

        if (!userAutoMatch) {
            console.log(`Auto-match disabled for user ${userId}. Skipping matching logic.`);
            return res.status(201).json({
                success: true,
                message: 'Swap request created successfully. (Auto-matching is disabled per your profile setting)',
                swapId: newParentSwapId,
                isAutoMatched: false
            });
        }

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
                WHERE s.status = 'active' 
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
                    // Do not auto-match. Just email the user the options and leave swap marked active.
                    let emailPartners = matchRows.map(r => ({
                        name: r.partner_name,
                        amount: r.remaining_amount,
                        type: r.type, // Added type
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
                // Find an opposite active swap.
                // If our swap allows partial, we can match any other partial-allowed swap, OR fully absorb a non-partial swap.
                // If our swap DOES NOT allow partial, we can only match if the other swap's remaining amount exactly equals what we need OR is greater (if they allow partial).
                let candidateQuery = `
                    SELECT * FROM swaps 
                    WHERE status = 'active' 
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
                const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'active';

                await promisePool.execute(
                    'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = \'matched\', NOW(), match_time) WHERE id = ?',
                    [newCandidateRemaining, candidateStatus, candidateStatus, candidate.id]
                );

                // Create CHILD SWAP representing the exact match chunk
                const [childResult] = await promisePool.execute(`
                    INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
                `, [
                    userId, type, chunkAmount, chunkAmount, 0, location, 'matched', candidate.user_id, newParentSwapId, candidate.id
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
            const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'active';
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

// Get all nearby swap requests
exports.getNearbySwaps = async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        // Fetch active swaps and join with users table to get the requester's name AND average rating
        const query = `
            SELECT s.id, s.type, s.amount, s.location, s.created_at, s.is_edited, u.name as requester_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = s.user_id) as requester_rating
            FROM swaps s 
            JOIN users u ON s.user_id = u.id 
            WHERE (s.status = 'active' OR s.status = 'open') AND s.user_id != ? 
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId]);

        const enhancedRows = rows.map(swap => ({ ...swap, distanceKm: undefined }));

        res.status(200).json({ success: true, swaps: enhancedRows });
    } catch (error) {
        console.error('Error fetching swaps:', error);
        res.status(500).json({ error: 'An error occurred while fetching swaps.' });
    }
};



// Complete a swap request
exports.completeSwap = async (req, res) => {
    const swapId = req.params.id;
    const userId = req.user?.id || req.session?.userId || req.body?.userId;

    console.log("User:", userId);
    console.log("Swap ID:", swapId);

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        const checkQuery = 'SELECT * FROM swaps WHERE id = ?';
        const [rows] = await promisePool.execute(checkQuery, [swapId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Swap request not found.' });
        }

        const swap = rows[0];
        console.log("Extracted swap status:", swap.status);

        if (swap.status.toLowerCase() === 'completed') {
            return res.status(200).json({ success: true, status: 'completed' });
        }

        if (swap.status.toLowerCase() !== 'matched' && swap.status.toLowerCase() !== 'pending_confirmation') {
            return res.status(400).json({ error: 'Only matched swaps can be completed.' });
        }

        // Allow either the creator or the matched user natively or via Matches table
        let isAuthorized = false;
        if (swap.user_id === userId || swap.matched_user_id === userId) {
            isAuthorized = true;
        } else {
            const [matchRows] = await promisePool.execute('SELECT * FROM matches WHERE swap_id = ? AND (requester_id = ? OR accepter_id = ?)', [swapId, userId, userId]);
            if (matchRows.length > 0) isAuthorized = true;
        }

        if (!isAuthorized) {
            return res.status(403).json({ error: 'You are not authorized to complete this swap.' });
        }

        let completedBy = [];
        try {
            completedBy = JSON.parse(swap.completed_by || '[]');
        } catch (e) {
            completedBy = [];
        }

        if (!completedBy.includes(userId)) {
            completedBy.push(userId);
        }

        let newStatus = swap.status;
        if (completedBy.length >= 2) {
            newStatus = 'completed';
        } else {
            newStatus = 'pending_confirmation';
        }

        await promisePool.execute('UPDATE swaps SET completed_by = ?, status = ? WHERE id = ?', [JSON.stringify(completedBy), newStatus, swapId]);
        await promisePool.execute('UPDATE matches SET status = ? WHERE swap_id = ?', [newStatus, swapId]);

        if (newStatus === 'completed') {
            // Both have completed! Finalize it.

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

        } else {
            // Only one has completed, waiting for partner
            const partnerId = (swap.user_id === userId) ? swap.matched_user_id : swap.user_id;

            if (partnerId) {
                try {
                    const [meRows] = await promisePool.execute('SELECT name FROM users WHERE id = ?', [userId]);
                    const [partnerRows] = await promisePool.execute('SELECT email FROM users WHERE id = ?', [partnerId]);

                    if (meRows.length > 0 && partnerRows.length > 0) {
                        const { sendPendingConfirmationEmail } = require('../utils/emailService');
                        const postedTime = new Date(swap.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, dateStyle: 'medium', timeStyle: 'short' });
                        await sendPendingConfirmationEmail(partnerRows[0].email, meRows[0].name, swap.amount, swap.type, swap.location, postedTime);
                    }
                } catch (err) {
                    console.error('Error sending pending confirmation email:', err);
                }
            }

            return res.status(200).json({ success: true, status: 'pending_confirmation' });
        }
    } catch (error) {
        console.error('Complete Swap Error:', error);
        res.status(500).json({ success: false, error: error.message });
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
              AND status IN ('active', 'open', 'matched', 'pending_confirmation')
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

// Get the current user's active swaps 
exports.getActiveSwaps = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    try {
        const query = `
            SELECT s.*,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE s.user_id = ? AND (s.status = 'active' OR s.status = 'open')
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId]);

        // Add context for the frontend
        const swapsWithContext = rows.map(swap => {
            return {
                ...swap,
                // Determine if the logged in user is the creator
                isCreator: swap.user_id === userId,
                // Easy access to the "other" party's name
                otherPartyName: swap.matched_name || 'Waiting...',
                otherPartyId: swap.matched_user_id,
                // Add the relevant rating based on who created vs matched
                otherPartyRating: swap.matched_rating
            };
        });

        res.status(200).json({ success: true, swaps: swapsWithContext });
    } catch (error) {
        console.error('Error fetching my swaps:', error);
        res.status(500).json({ error: 'An error occurred while fetching your swaps.' });
    }
};

// Get Matched Swaps
exports.getMatchedSwaps = async (req, res) => {
    try {
        const currentUserId = req.user?.id || req.body?.userId || req.session?.userId;
        if (!currentUserId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const query1 = `
SELECT 
  m.id AS match_id,
  m.swap_id,
  m.requester_id,
  m.accepter_id,
  s.status,
  s.is_edited,
  s.created_at AS posted_time,
  s.amount,
  s.type,
  s.location,
  u1.name AS requester_name,
  u2.name AS accepter_name,
  (SELECT COUNT(*) FROM chat_messages cm WHERE cm.swap_id = m.swap_id AND cm.sender_id != ? AND cm.status != 'seen') AS unread_count
FROM matches m
JOIN swaps s ON m.swap_id = s.id
JOIN users u1 ON m.requester_id = u1.id
JOIN users u2 ON m.accepter_id = u2.id
WHERE 
  (s.status = 'matched' OR s.status = 'MATCHED' OR s.status = 'pending_confirmation')
  AND (m.requester_id = ? OR m.accepter_id = ?)
ORDER BY m.created_at DESC;
        `;
        
        const [rows1] = await promisePool.execute(query1, [currentUserId, currentUserId, currentUserId]);

        const query2 = `
SELECT 
  s.id AS match_id,
  s.id AS swap_id,
  s.user_id AS requester_id,
  s.matched_user_id AS accepter_id,
  s.status,
  s.is_edited,
  s.created_at AS posted_time,
  s.created_at AS matched_time,
  s.amount,
  s.type,
  s.location,
  u1.name AS requester_name,
  u2.name AS accepter_name,
  (SELECT COUNT(*) FROM chat_messages cm WHERE cm.swap_id = s.id AND cm.sender_id != ? AND cm.status != 'seen') AS unread_count
FROM swaps s
LEFT JOIN users u1 ON s.user_id = u1.id
LEFT JOIN users u2 ON s.matched_user_id = u2.id
WHERE (s.status = 'matched' OR s.status = 'MATCHED' OR s.status = 'pending_confirmation')
AND (s.user_id = ? OR s.matched_user_id = ?)
ORDER BY s.created_at DESC;
        `;
        const [rows2] = await promisePool.execute(query2, [currentUserId, currentUserId, currentUserId]);

        const swapIdsInMatches = new Set(rows1.map(r => r.swap_id));
        const filteredRows2 = rows2.filter(r => !swapIdsInMatches.has(r.swap_id));

        const matches = [...rows1, ...filteredRows2].sort((a, b) => new Date(b.matched_time) - new Date(a.matched_time));

        console.log("Matched rows:", matches);
        res.status(200).json({ success: true, swaps: matches, currentUserId });
    } catch (err) {
        console.error("Matched API Error:", err);
        return res.status(500).json({
            error: "Failed to load matched swaps",
            details: err.message
        });
    }
};

// Get Completed Swaps
exports.getCompletedSwaps = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    try {
        const query = `
            SELECT s.*,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE (s.user_id = ? OR s.matched_user_id = ?) AND s.status = 'completed'
            ORDER BY s.created_at DESC
        `;
        const [rows] = await promisePool.execute(query, [userId, userId]);

        const swapsWithContext = rows.map(swap => {
            return {
                ...swap,
                isCreator: swap.user_id === userId,
                otherPartyName: swap.user_id === userId ? swap.matched_name : swap.creator_name,
                otherPartyId: swap.user_id === userId ? swap.matched_user_id : swap.user_id,
                otherPartyRating: swap.user_id === userId ? swap.matched_rating : swap.creator_rating
            };
        });

        res.status(200).json({ success: true, swaps: swapsWithContext });
    } catch (error) {
        console.error('Error fetching completed swaps:', error);
        res.status(500).json({ error: 'An error occurred while fetching completed swaps.' });
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

        // 1. Resolve Authorization and Opposite User ID targeting DB matches vs legacy swaps
        let isAuthorized = false;
        let ratedUserId = null;

        if (swap.user_id === userId || swap.matched_user_id === userId) {
            isAuthorized = true;
            ratedUserId = (swap.user_id === userId) ? swap.matched_user_id : swap.user_id;
        }

        if (!isAuthorized || !ratedUserId) {
            const [matchRows] = await promisePool.execute('SELECT requester_id, accepter_id FROM matches WHERE swap_id = ?', [swapId]);
            if (matchRows.length > 0) {
                const match = matchRows[0];
                if (match.requester_id === userId || match.accepter_id === userId) {
                    isAuthorized = true;
                    ratedUserId = (match.requester_id === userId) ? match.accepter_id : match.requester_id;
                }
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ error: 'You are not authorized to rate this swap.' });
        }

        if (!ratedUserId) {
            return res.status(500).json({ error: 'Failed to resolve partner ID to rate.' });
        }

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
exports.getPartners = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    try {
        const { amount, type } = req.query; 

        if (!amount || !type) {
            return res.status(400).json({ error: 'Missing amount or type parameters.' });
        }

        let oppositeType;
        if (type === 'need_cash' || type === 'CASH') {
             oppositeType = 'need_upi'; // Requester needs cash, find people offering cash (need_upi)
        } else if (type === 'need_upi' || type === 'UPI') {
             oppositeType = 'need_cash';
        } else {
             return res.status(400).json({ error: 'Invalid type parameter' });
        }

        let remainingNeeded = parseFloat(amount);

        let candidateQuery = `
            SELECT s.*, u.name as partner_name, u.email as partner_email,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as partner_rating
            FROM swaps s 
            JOIN users u ON s.user_id = u.id
            WHERE s.status = 'active' 
              AND s.type = ? 
              AND s.user_id != ? 
              AND s.remaining_amount > 0
            ORDER BY s.created_at ASC LIMIT 50
        `;
        let queryParams = [oppositeType, userId];

        const [matchRows] = await promisePool.execute(candidateQuery, queryParams);

        const validPartners = matchRows.map(r => ({
            id: r.id,
            partner_name: r.partner_name,
            partner_rating: r.partner_rating,
            location: r.location,
            amount: parseFloat(r.remaining_amount)
        }));

        res.status(200).json({ success: true, partners: validPartners });
    } catch (error) {
        console.error('Swap API error:', error);
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
        if (mySwap.status !== 'active') return res.status(400).json({ error: 'Swap is no longer active.' });

        let remainingNeeded = parseFloat(mySwap.remaining_amount);
        let selectionGroupId = 'GRP-' + Date.now();
        let matchedChunks = [];

        for (let i = 0; i < selectedPartners.length; i++) {
            const partner = selectedPartners[i];
            const candidateId = partner.id;
            const requestedChunk = parseFloat(partner.amount);

            if (remainingNeeded <= 0) break; // Safety net

            const [pRows] = await promisePool.execute('SELECT remaining_amount, user_id, status FROM swaps WHERE id = ? AND status = "active"', [candidateId]);
            if (pRows.length === 0) continue; // Partner was taken

            const candidateSwap = pRows[0];
            const candidateRemaining = parseFloat(candidateSwap.remaining_amount);

            let actualChunk = Math.min(requestedChunk, candidateRemaining, remainingNeeded);
            if (actualChunk <= 0) continue;

            const newCandidateRemaining = candidateRemaining - actualChunk;
            const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'active';

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

        const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'active';
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

        // Reset notification state for the requester (current user)
        console.log("Resetting notification state for user after partner selection:", userId);
        await promisePool.execute(
            'UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = ?',
            [userId]
        );

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

// Create a Swap Feed API
exports.getSwapFeed = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    try {
        // 1. Fetch user's auto_match preference
        const [userRows] = await promisePool.execute('SELECT auto_match FROM users WHERE id = ?', [userId]);
        const userAutoMatch = userRows.length > 0 ? (userRows[0].auto_match === 1 || userRows[0].auto_match === true) : true;

        // 2. Fetch user's active swaps to identify potential "Best Matches"
        const [myActiveSwaps] = await promisePool.execute(
            'SELECT amount, type FROM swaps WHERE user_id = ? AND (status = "active" OR status = "open")',
            [userId]
        );

        // 3. Fetch all active swaps from other users
        const { minAmount, maxAmount, type, sort } = req.query;

        let queryParams = [userId];
        
        let query = `
            SELECT 
              s.id,
              s.user_id,
              u.name,
              s.amount,
              s.type,
              s.status,
              s.is_edited,
              s.location,
              s.created_at,
              (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as trustScore
            FROM swaps s
            JOIN users u ON s.user_id = u.id
            WHERE (LCASE(s.status) = 'active' OR LCASE(s.status) = 'open') AND s.user_id != ?
        `;

        if (minAmount) {
            query += " AND s.amount >= ?";
            queryParams.push(parseFloat(minAmount));
        }

        if (maxAmount) {
            query += " AND s.amount <= ?";
            queryParams.push(parseFloat(maxAmount));
        }

        if (type === 'UPI') {
            query += " AND s.type = 'need_upi'";
        } else if (type === 'CASH') {
            query += " AND s.type = 'need_cash'";
        }

        const [rows] = await promisePool.execute(query, queryParams);

        // Fetch userAmount for sorting
        let userAmount = 0;
        const [lastReqRows] = await promisePool.execute(
            'SELECT amount FROM swaps WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        if (lastReqRows.length > 0) {
            userAmount = parseFloat(lastReqRows[0].amount);
        }

        // 4. Transform and Filter
        const enrichedSwaps = rows.map(swap => {
            const swapAmount = parseFloat(swap.amount);
            const oppositeType = swap.type === 'need_cash' ? 'need_upi' : 'need_cash';
            
            // Check if this swap is a "Best Match" (exact amount and compatible type)
            const isBestMatch = myActiveSwaps.some(mySwap => 
                parseFloat(mySwap.amount) === swapAmount && mySwap.type === oppositeType
            );

            return { ...swap, isBestMatch };
        });

        let finalSwaps = enrichedSwaps;
        if (userAutoMatch) {
            // IF auto_match = ON, do NOT show exact matches in feed
            finalSwaps = enrichedSwaps.filter(s => !s.isBestMatch);
        }

        // Apply advanced sorting logically based on Trust Score, Amount Diff, Latest Created
        finalSwaps.sort((a, b) => {
            const scoreA = parseFloat(a.trustScore) || 0;
            const scoreB = parseFloat(b.trustScore) || 0;

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            const diffA = Math.abs(parseFloat(a.amount) - userAmount);
            const diffB = Math.abs(parseFloat(b.amount) - userAmount);

            if (diffA !== diffB) {
                return diffA - diffB;
            }

            return new Date(b.created_at) - new Date(a.created_at);
        });

        console.log(`Feed query for user ${userId} returned ${finalSwaps.length} rows (Auto-match: ${userAutoMatch})`);
        res.status(200).json({ success: true, swaps: finalSwaps });
    } catch (error) {
        console.error("Feed API Error:", error);
        res.status(500).json({
          success: false,
          error: error.message
        });
    }
};

// Accept a Swap from the Feed
exports.acceptSwap = async (req, res) => {
    try {
        console.log("---- ACCEPT SWAP START ----");
        console.log("Request body:", req.body);

        const { swapId } = req.body;

        const currentUserId = req.user?.id || req.body.userId || req.session?.userId;

        console.log("Current User:", currentUserId);

        if (!swapId) {
            return res.status(400).json({ error: "swapId missing" });
        }

        if (!currentUserId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        const [swapRows] = await promisePool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);
        
        const swap = swapRows.length > 0 ? swapRows[0] : null;

        console.log("Swap found:", swap);

        if (!swap) {
            return res.status(404).json({ error: "Swap not found" });
        }

        if (Number(swap.user_id) === Number(currentUserId)) {
            console.log("Blocking self-acceptance:", swap.user_id, currentUserId);
            return res.status(400).json({
                error: "Cannot accept your own swap"
            });
        }

        const validStatuses = ['active', 'open', 'pending'];
        const currentStatus = swap.status ? swap.status.toLowerCase() : '';
        if (!validStatuses.includes(currentStatus)) {
            console.log("Blocking inactive status:", swap.status);
            return res.status(400).json({
                error: "Swap already matched or inactive"
            });
        }

        console.log("Inserting match...");

        await promisePool.execute(`
          INSERT INTO matches (swap_id, requester_id, accepter_id, status, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [
          swapId,
          swap.user_id,
          currentUserId,
          "matched"
        ]);

        console.log("Updating requester's swap...");
        await promisePool.execute(`
          UPDATE swaps
          SET status = 'matched',
              matched_user_id = ?
          WHERE id = ?
        `, [currentUserId, swapId]);

        // --- NEW: Also match the ACCEPTER'S active swap if it exists and matches ---
        console.log("Checking for a matching active swap for the accepter (User B)...");
        const oppositeType = swap.type === 'need_cash' ? 'need_upi' : 'need_cash';
        
        // Find the BEST matching active swap for the current user
        const [myMatchRows] = await promisePool.execute(`
            SELECT id FROM swaps 
            WHERE user_id = ? 
              AND (status = 'active' OR status = 'open') 
              AND type = ? 
              AND amount = ? 
            ORDER BY created_at ASC 
            LIMIT 1
        `, [currentUserId, oppositeType, swap.amount]);

        if (myMatchRows.length > 0) {
            const mySwapId = myMatchRows[0].id;
            console.log(`Matching accepter's swap ${mySwapId} with requester's swap ${swapId}`);
            await promisePool.execute(`
                UPDATE swaps 
                SET status = 'matched', 
                    matched_user_id = ? 
                WHERE id = ?
            `, [swap.user_id, mySwapId]);
        }

        console.log("Resetting notification state for user:", currentUserId);
        await promisePool.execute(
            'UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = ?',
            [currentUserId]
        );

        console.log("SUCCESS");

        res.json({ success: true, message: "Swap matched successfully" });

    } catch (err) {
        console.error("❌ ACCEPT ERROR:", err);
        res.status(500).json({
            error: "Internal server error",
            details: err.message
        });
    }
};

// Delete a swap request
exports.deleteSwap = async (req, res) => {
    const swapId = req.params.id;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
    }

    try {
        // 1. Find the swap
        const [rows] = await promisePool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Swap request not found.' });
        }

        const swap = rows[0];

        // 2. Ensure only owner can delete
        if (Number(swap.user_id) !== Number(userId)) {
            return res.status(403).json({ success: false, error: 'You are not authorized to delete this swap.' });
        }

        // 3. Allow delete only if status is 'active'
        if (swap.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete matched or completed swaps.'
            });
        }

        // 4. Perform deletion
        await promisePool.execute('DELETE FROM swaps WHERE id = ?', [swapId]);

        res.json({ success: true, message: 'Swap deleted successfully.' });

    } catch (error) {
        console.error('Delete Swap Error:', error);
        res.status(500).json({ success: false, error: 'An error occurred while deleting the swap.' });
    }
};
// Update an active swap request
exports.updateSwap = async (req, res) => {
    const swapId = req.params.id;
    const userId = req.session.userId;
    const { amount, location, type } = req.body;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
    }

    if (!amount || !location || !type) {
        return res.status(400).json({ success: false, error: 'Missing required fields: amount, location, type' });
    }

    if (type !== 'need_cash' && type !== 'need_upi') {
        return res.status(400).json({ success: false, error: 'Invalid swap type.' });
    }

    try {
        // 1. Find the swap
        const [rows] = await promisePool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Swap request not found.' });
        }

        const swap = rows[0];

        // 2. Ensure only owner can edit
        if (Number(swap.user_id) !== Number(userId)) {
            return res.status(403).json({ success: false, error: 'You are not authorized to edit this swap.' });
        }

        // 3. Allow edit only if status is 'active' or 'open'
        if (swap.status !== 'active' && swap.status !== 'open') {
            return res.status(400).json({
                success: false,
                error: 'Cannot edit matched or completed swaps.'
            });
        }

        // 4. Complexity Check: If partially matched, editing is blocked for safety
        if (parseFloat(swap.remaining_amount) !== parseFloat(swap.total_amount)) {
            return res.status(400).json({
                success: false,
                error: 'Cannot edit partially matched swaps. Delete and create a new request if needed.'
            });
        }

        // 5. Update the swap
        // We update type, amount, total_amount, remaining_amount
        // created_at is updated to NOW() to "update the posted time"
        // is_edited is set to TRUE for the frontend label
        await promisePool.execute(`
            UPDATE swaps 
            SET type = ?, amount = ?, total_amount = ?, remaining_amount = ?, location = ?, created_at = NOW(), is_edited = TRUE 
            WHERE id = ?
        `, [type, amount, amount, amount, location, swapId]);

        res.json({ success: true, message: 'Swap updated successfully.' });

    } catch (error) {
        console.error('Update Swap Error:', error);
        res.status(500).json({ success: false, error: 'An error occurred while updating the swap.' });
    }
};
