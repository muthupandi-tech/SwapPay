// const mysql = require('mysql2');
const { Pool } = require('pg');
const { sendSwapMatchedEmail, sendSwapCompletedEmail, sendRatingReceivedEmail } = require('../utils/emailService');
const pool = require('../config/db');

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

        // --- NEW: Respect User's auto_match preference and fetch location ---
        // const [userRows] = await pool.execute('SELECT auto_match, latitude, longitude FROM users WHERE id = ?', [userId]);
        const { rows: userRows } = await pool.query('SELECT auto_match, latitude, longitude FROM users WHERE id = $1', [userId]);
        const userAutoMatch = userRows.length > 0 ? (userRows[0].auto_match === 1 || userRows[0].auto_match === true) : true;
        const userLat = userRows.length > 0 ? userRows[0].latitude : null;
        const userLng = userRows.length > 0 ? userRows[0].longitude : null;

        // 1. Insert the PARENT swap request initially
        /*
        const insertQuery = 'INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match, allow_partner_selection, auto_accept_perfect, latitude, longitude, is_partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await pool.execute(insertQuery, [userId, type, parsedAmount, parsedAmount, parsedAmount, location, 'active', isPartialAllowed, isPartnerSelection, isAutoAcceptPerfect, userLat, userLng, isPartialAllowed]);
        const newParentSwapId = result.insertId;
        */
        const insertQuery = 'INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, allow_partial_match, allow_partner_selection, auto_accept_perfect, latitude, longitude, is_partial) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id';
        const { rows: insertRows } = await pool.query(insertQuery, [userId, type, parsedAmount, parsedAmount, parsedAmount, location, 'active', isPartialAllowed, isPartnerSelection, isAutoAcceptPerfect, userLat, userLng, isPartialAllowed]);
        const newParentSwapId = insertRows[0].id;

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
                  AND s.type = $1 
                  AND s.user_id != $2 
                  AND s.remaining_amount > 0
            `;
            let queryParams = [oppositeType, userId];

            if (!isPartialAllowed) {
                candidateQuery += ` AND s.remaining_amount >= $3 AND (s.allow_partial_match = TRUE OR s.remaining_amount = $4) `;
                queryParams.push(remainingNeeded, remainingNeeded);
            } else {
                candidateQuery += ` AND (s.allow_partial_match = TRUE OR s.remaining_amount <= $3) `;
                queryParams.push(remainingNeeded);
            }

            candidateQuery += ` ORDER BY CASE WHEN s.remaining_amount = $3 THEN 1 ELSE 2 END, s.created_at ASC LIMIT 10`;
            queryParams.push(remainingNeeded);

            // const [matchRows] = await pool.execute(candidateQuery, queryParams);
            const { rows: matchRows } = await pool.query(candidateQuery, queryParams);

            if (matchRows.length > 0) {
                let perfectMatchIndex = matchRows.findIndex(r => parseFloat(r.remaining_amount) === remainingNeeded);

                if (isAutoAcceptPerfect && perfectMatchIndex !== -1) {
                    // Force the while loop to perform the standard auto-match mechanism
                    autoMatchProceed = true;
                } else {
                    // Do not auto-match. Just email the user the options and leave swap marked active.
                    const emailPartners = matchRows.map(r => ({
                        name: r.partner_name,
                        amount: r.remaining_amount,
                        rating: r.partner_rating,
                        location: r.location
                    }));

                    // const [userRows] = await pool.execute('SELECT email FROM users WHERE id = ?', [userId]);
                    const { rows: uRows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
                    if (uRows.length > 0) {
                        const { sendMultiplePartnersAvailableEmail } = require('../utils/emailService');
                        await sendMultiplePartnersAvailableEmail(uRows[0].email, parsedAmount, emailPartners);
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
                      AND type = $1 
                      AND user_id != $2 
                      AND remaining_amount > 0
                `;
                let queryParams = [oppositeType, userId];

                if (!isPartialAllowed) {
                    candidateQuery += ` AND remaining_amount >= $3 `;
                    candidateQuery += ` AND (allow_partial_match = TRUE OR remaining_amount = $4) `;
                    queryParams.push(remainingNeeded, remainingNeeded);
                } else {
                    candidateQuery += ` AND (allow_partial_match = TRUE OR remaining_amount <= $3) `;
                    queryParams.push(remainingNeeded);
                }

                candidateQuery += ` ORDER BY created_at ASC LIMIT 1`;

                // const [matchRows] = await pool.execute(candidateQuery, queryParams);
                const { rows: matchRows } = await pool.query(candidateQuery, queryParams);

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

                /*
                await pool.execute(
                    'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = \'matched\', NOW(), match_time) WHERE id = ?',
                    [newCandidateRemaining, candidateStatus, candidateStatus, candidate.id]
                );
                */
                await pool.query(
                    'UPDATE swaps SET remaining_amount = $1, status = $2, match_time = CASE WHEN $3 = \'matched\' THEN NOW() ELSE match_time END WHERE id = $4',
                    [newCandidateRemaining, candidateStatus, candidateStatus, candidate.id]
                );

                // Create CHILD SWAP representing the exact match chunk
                /*
                const [childResult] = await pool.execute(`
                    INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id, latitude, longitude) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
                `, [
                    userId, type, chunkAmount, chunkAmount, 0, location, 'matched', candidate.user_id, newParentSwapId, candidate.id, userLat, userLng
                ]);
                */
                const { rows: childResult } = await pool.query(`
                    INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id, latitude, longitude) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12) RETURNING id
                `, [
                    userId, type, chunkAmount, chunkAmount, 0, location, 'matched', candidate.user_id, newParentSwapId, candidate.id, userLat, userLng
                ]);

                matchedChunks.push({
                    partnerId: candidate.user_id,
                    chunkAmount: chunkAmount,
                    childSwapId: childResult[0].id,
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
            /*
            await pool.execute(
                'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = \'matched\', NOW(), match_time) WHERE id = ?',
                [remainingNeeded, finalParentStatus, finalParentStatus, newParentSwapId]
            );
            */
            await pool.query(
                'UPDATE swaps SET remaining_amount = $1, status = $2, match_time = CASE WHEN $3 = \'matched\' THEN NOW() ELSE match_time END WHERE id = $4',
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
                    // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [userId, 'Partial Match', msg, 'match']);
                    // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [partnerId, 'Partial Match', msg, 'match']);
                    await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [userId, 'Partial Match', msg, 'match']);
                    await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [partnerId, 'Partial Match', msg, 'match']);

                    if (global.io) {
                        global.io.to(`user_${userId}`).emit('notification', { title: 'Partial Match', message: msg, type: 'match', created_at: new Date() });
                        global.io.to(`user_${partnerId}`).emit('notification', { title: 'Partial Match', message: msg, type: 'match', created_at: new Date() });
                        global.io.emit('admin_activity', { event: 'Crowd-Swap Match', swapId: chunk.childSwapId, details: `Child Swap #${chunk.childSwapId} created for ₹${chunkAmt}.` });
                    }

                    // Emails
                    (async () => {
                        try {
                            // const [meRows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);
                            // const [partnerRows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [partnerId]);
                            const { rows: meRows } = await pool.query('SELECT email, name FROM users WHERE id = $1', [userId]);
                            const { rows: partnerRows } = await pool.query('SELECT email, name FROM users WHERE id = $1', [partnerId]);

                            if (meRows.length > 0 && partnerRows.length > 0) {
                                const me = meRows[0];
                                const partner = partnerRows[0];

                                // Our remaining is remainingNeededAfter
                                await sendPartialMatchEmail(me.email, chunkAmt, chunk.remainingNeededAfter, partner.name, type === 'need_cash' ? 'Need Cash' : 'Need UPI', location);

                                // Partner remaining needs to pull from DB, but we know it's CandidateParent's remaining
                                // const [pRow] = await pool.execute('SELECT remaining_amount FROM swaps WHERE id = ?', [chunk.candidateParentId]);
                                const { rows: pRow } = await pool.query('SELECT remaining_amount FROM swaps WHERE id = $1', [chunk.candidateParentId]);
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
            // const [userRows] = await pool.execute('SELECT email FROM users WHERE id = ?', [userId]);
            const { rows: uEmailRows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
            if (uEmailRows.length > 0) {
                const { sendSwapCreatedEmail } = require('../utils/emailService');
                await sendSwapCreatedEmail(uEmailRows[0].email, type, parsedAmount, location);
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
            SELECT s.id, s.type, s.remaining_amount as amount, s.location, s.created_at, s.is_edited, u.name as requester_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = s.user_id) as requester_rating
            FROM swaps s 
            JOIN users u ON s.user_id = u.id 
            WHERE (s.status = 'active' OR s.status = 'open') AND s.user_id != $1 
            ORDER BY s.created_at DESC
        `;
        // const [rows] = await pool.execute(query, [userId]);
        const { rows } = await pool.query(query, [userId]);

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
        // const checkQuery = 'SELECT * FROM swaps WHERE id = ?';
        // const [rows] = await pool.execute(checkQuery, [swapId]);
        const { rows } = await pool.query('SELECT * FROM swaps WHERE id = $1', [swapId]);

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
            // const [matchRows] = await pool.execute('SELECT * FROM matches WHERE swap_id = ? AND (requester_id = ? OR accepter_id = ?)', [swapId, userId, userId]);
            const { rows: matchRows } = await pool.query('SELECT * FROM matches WHERE swap_id = $1 AND (requester_id = $2 OR accepter_id = $3)', [swapId, userId, userId]);
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

        if (newStatus === 'completed') {
            // await pool.execute('UPDATE swaps SET completed_by = ?, status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(completedBy), newStatus, swapId]);
            await pool.query('UPDATE swaps SET completed_by = $1, status = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3', [JSON.stringify(completedBy), newStatus, swapId]);
        } else {
            // await pool.execute('UPDATE swaps SET completed_by = ?, status = ? WHERE id = ?', [JSON.stringify(completedBy), newStatus, swapId]);
            await pool.query('UPDATE swaps SET completed_by = $1, status = $2 WHERE id = $3', [JSON.stringify(completedBy), newStatus, swapId]);
        }
        // await pool.execute('UPDATE matches SET status = ? WHERE swap_id = ?', [newStatus, swapId]);
        await pool.query('UPDATE matches SET status = $1 WHERE swap_id = $2', [newStatus, swapId]);

        if (newStatus === 'completed') {
            // Both have completed! Finalize it.

            // --- NEW: Trust Recovery System ---
            for (let uid of [swap.user_id, swap.matched_user_id]) {
                if (!uid) continue;
                // const [trustRows] = await pool.execute('SELECT AVG(stars) AS avg_stars FROM ratings WHERE rated_user_id = ?', [uid]);
                const { rows: trustRows } = await pool.query('SELECT AVG(stars) AS avg_stars FROM ratings WHERE rated_user_id = $1', [uid]);
                const avgStars = parseFloat(trustRows[0].avg_stars);
                if (!isNaN(avgStars) && avgStars < 2) {
                    // const [uRow] = await pool.execute('SELECT recovery_progress FROM users WHERE id = ?', [uid]);
                    const { rows: uRow } = await pool.query('SELECT recovery_progress FROM users WHERE id = $1', [uid]);
                    if (uRow.length > 0) {
                        let prog = (uRow[0].recovery_progress || 0) + 1;
                        if (prog >= 2) {
                            // await pool.execute('UPDATE users SET recovery_progress = 0 WHERE id = ?', [uid]);
                            await pool.query('UPDATE users SET recovery_progress = 0 WHERE id = $1', [uid]);
                            const msg = "✅ Your account is back to good standing! Keep completing swaps to naturally improve your Trust Score.";
                            // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [uid, 'Account Restored', msg, 'system']);
                            await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [uid, 'Account Restored', msg, 'system']);
                            if (global.io) {
                                global.io.to(`user_${uid}`).emit('notification', { title: 'Account Restored', message: msg, type: 'system', created_at: new Date() });
                            }
                        } else {
                            // await pool.execute('UPDATE users SET recovery_progress = ? WHERE id = ?', [prog, uid]);
                            await pool.query('UPDATE users SET recovery_progress = $1 WHERE id = $2', [prog, uid]);
                        }
                    }
                }
            }
            // --- END NEW ---

            // Notify BOTH users
            const msg = `Swap exchange marked as completed! Don't forget to rate your partner.`;
            const title = 'Swap Completed';
            const type = 'completed';

            // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [swap.user_id, title, msg, type]);
            await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [swap.user_id, title, msg, type]);
            if (swap.matched_user_id) {
                // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [swap.matched_user_id, title, msg, type]);
                await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [swap.matched_user_id, title, msg, type]);
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
                // const [u1Rows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [swap.user_id]);
                // const [u2Rows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [swap.matched_user_id]);
                const { rows: u1Rows } = await pool.query('SELECT email, name FROM users WHERE id = $1', [swap.user_id]);
                const { rows: u2Rows } = await pool.query('SELECT email, name FROM users WHERE id = $1', [swap.matched_user_id]);

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
                // const [pRows] = await pool.execute('SELECT remaining_amount FROM swaps WHERE id = ?', [pid]);
                const { rows: pRows } = await pool.query('SELECT remaining_amount FROM swaps WHERE id = $1', [pid]);
                if (pRows.length > 0 && parseFloat(pRows[0].remaining_amount) === 0) {
                    /*
                    const [cRows] = await pool.execute(
                        'SELECT id FROM swaps WHERE (parent_swap_id = ? OR matched_parent_swap_id = ?) AND status != "completed"',
                        [pid, pid]
                    );
                    */
                    const { rows: cRows } = await pool.query(
                        'SELECT id FROM swaps WHERE (parent_swap_id = $1 OR matched_parent_swap_id = $2) AND status != \'completed\'',
                        [pid, pid]
                    );
                    if (cRows.length === 0) {
                        // await pool.execute('UPDATE swaps SET status = "completed", completed_at = CURRENT_TIMESTAMP WHERE id = ?', [pid]);
                        await pool.query('UPDATE swaps SET status = \'completed\', completed_at = CURRENT_TIMESTAMP WHERE id = $1', [pid]);
                    }
                }
            }

        } else {
            // Only one has completed, waiting for partner
            const partnerId = (swap.user_id === userId) ? swap.matched_user_id : swap.user_id;

            if (partnerId) {
                try {
                    // const [meRows] = await pool.execute('SELECT name FROM users WHERE id = ?', [userId]);
                    // const [partnerRows] = await pool.execute('SELECT email FROM users WHERE id = ?', [partnerId]);
                    const { rows: meRows } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
                    const { rows: partnerRows } = await pool.query('SELECT email FROM users WHERE id = $1', [partnerId]);

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
            WHERE (user_id = $1 OR matched_user_id = $2) 
              AND status IN ('active', 'open', 'matched', 'pending_confirmation')
        `;
        // const [activeRows] = await pool.execute(activeSwapsQuery, [userId, userId]);
        const { rows: activeRows } = await pool.query(activeSwapsQuery, [userId, userId]);
        const activeSwaps = activeRows[0].count;

        // Total Exchanged: sum of amounts where status completed
        const exchangedQuery = `
            SELECT COALESCE(SUM(amount), 0) AS total 
            FROM swaps 
            WHERE (user_id = $1 OR matched_user_id = $2) 
              AND status = 'completed'
        `;
        // const [exchangedRows] = await pool.execute(exchangedQuery, [userId, userId]);
        const { rows: exchangedRows } = await pool.query(exchangedQuery, [userId, userId]);
        const totalExchanged = parseFloat(exchangedRows[0].total) || 0;

        // Trust Score: Based on ratings
        const trustQuery = `
            SELECT AVG(stars) AS avg_stars
            FROM ratings 
            WHERE rated_user_id = $1
        `;
        // const [trustRows] = await pool.execute(trustQuery, [userId]);
        const { rows: trustRows } = await pool.query(trustQuery, [userId]);
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

        // Recovery progress
        // const [uRow] = await pool.execute('SELECT recovery_progress FROM users WHERE id = ?', [userId]);
        const { rows: uRow } = await pool.query('SELECT recovery_progress FROM users WHERE id = $1', [userId]);
        const recoveryProgress = uRow.length > 0 ? uRow[0].recovery_progress : 0;

        res.status(200).json({ activeSwaps, totalExchanged, trustScore, role, avgStars, recoveryProgress });
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
            SELECT s.id, s.user_id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.matched_user_id, s.match_time, s.parent_swap_id, s.matched_parent_swap_id, s.latitude, s.longitude, s.completed_at, s.created_at, s.is_edited,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE s.user_id = $1 AND (s.status = 'active' OR s.status = 'open')
            ORDER BY s.created_at DESC
        `;
        // const [parentRows] = await pool.execute(query, [userId]);
        const { rows: parentRows } = await pool.query(query, [userId]);
        
        let allRows = [...parentRows];

        if (parentRows.length > 0) {
            const parentIds = parentRows.map(r => r.id);
            const placeholders = parentIds.map((_, i) => '$' + (i + 1)).join(',');
            const placeholders2 = parentIds.map((_, i) => '$' + (i + 1 + parentIds.length)).join(',');
            const childQuery = `
                SELECT s.id, s.user_id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.matched_user_id, s.match_time, s.parent_swap_id, s.matched_parent_swap_id, s.latitude, s.longitude, s.completed_at, s.created_at, s.is_edited,
                u1.name as creator_name, u2.name as matched_name,
                (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
                (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
                FROM swaps s 
                LEFT JOIN users u1 ON s.user_id = u1.id 
                LEFT JOIN users u2 ON s.matched_user_id = u2.id
                WHERE (s.parent_swap_id IN (${placeholders}) OR s.matched_parent_swap_id IN (${placeholders2}))
            `;
            // const [childRows] = await pool.execute(childQuery, [...parentIds, ...parentIds]);
            const { rows: childRows } = await pool.query(childQuery, [...parentIds, ...parentIds]);
            
            // Avoid duplicate rows if a query returns overlapping data
            const existingIds = new Set(allRows.map(r => r.id));
            childRows.forEach(row => {
                if (!existingIds.has(row.id)) {
                    allRows.push(row);
                }
            });
        }

        // Add context for the frontend
        const swapsWithContext = allRows.map(swap => {
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
  AND (m.requester_id = $2 OR m.accepter_id = $3)
ORDER BY m.created_at DESC;
        `;
        
        // const [rows1] = await pool.execute(query1, [currentUserId, currentUserId, currentUserId]);
        const { rows: rows1 } = await pool.query(query1, [currentUserId, currentUserId, currentUserId]);

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
AND (s.user_id = $2 OR s.matched_user_id = $3)
ORDER BY s.created_at DESC;
        `;
        // const [rows2] = await pool.execute(query2, [currentUserId, currentUserId, currentUserId]);
        const { rows: rows2 } = await pool.query(query2, [currentUserId, currentUserId, currentUserId]);

        const swapIdsInMatches = new Set(rows1.map(r => r.swap_id));
        const filteredRows2 = rows2.filter(r => !swapIdsInMatches.has(r.swap_id));

        const matches = [...rows1, ...filteredRows2].sort((a, b) => new Date(b.posted_time) - new Date(a.posted_time));

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
            SELECT s.id, s.user_id, s.type, s.amount, s.total_amount, s.remaining_amount, s.location, s.status, s.matched_user_id, s.match_time, s.parent_swap_id, s.matched_parent_swap_id, s.latitude, s.longitude, s.completed_at, s.created_at, s.is_edited,
            u1.name as creator_name, u2.name as matched_name,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u1.id) as creator_rating,
            (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u2.id) as matched_rating
            FROM swaps s 
            LEFT JOIN users u1 ON s.user_id = u1.id 
            LEFT JOIN users u2 ON s.matched_user_id = u2.id
            WHERE (s.user_id = $1 OR s.matched_user_id = $2) AND s.status = 'completed'
            ORDER BY COALESCE(s.completed_at, s.created_at) DESC
        `;
        // const [rows] = await pool.execute(query, [userId, userId]);
        const { rows } = await pool.query(query, [userId, userId]);

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
        // const checkQuery = 'SELECT status, user_id, matched_user_id FROM swaps WHERE id = ?';
        // const [rows] = await pool.execute(checkQuery, [swapId]);
        const { rows } = await pool.query('SELECT status, user_id, matched_user_id FROM swaps WHERE id = $1', [swapId]);

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
            // const [matchRows] = await pool.execute('SELECT requester_id, accepter_id FROM matches WHERE swap_id = ?', [swapId]);
            const { rows: matchRows } = await pool.query('SELECT requester_id, accepter_id FROM matches WHERE swap_id = $1', [swapId]);
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
        // const ratingCheckQuery = 'SELECT id FROM ratings WHERE swap_id = ? AND rater_user_id = ?';
        // const [ratingRows] = await pool.execute(ratingCheckQuery, [swapId, userId]);
        const { rows: ratingRows } = await pool.query('SELECT id FROM ratings WHERE swap_id = $1 AND rater_user_id = $2', [swapId, userId]);

        if (ratingRows.length > 0) {
            return res.status(400).json({ error: 'You have already rated this swap.' });
        }

        const insertQuery = 'INSERT INTO ratings (swap_id, rater_user_id, rated_user_id, stars) VALUES (?, ?, ?, ?)';
        // await pool.execute(insertQuery, [swapId, userId, ratedUserId, stars]);
        await pool.query('INSERT INTO ratings (swap_id, rater_user_id, rated_user_id, stars) VALUES ($1, $2, $3, $4)', [swapId, userId, ratedUserId, stars]);

        // Notify Rated User
        const msg = `You received a ${stars}-star rating from your recent swap partner.`;
        const title = 'New Rating';
        const type = 'rating';
        // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [ratedUserId, title, msg, type]);
        await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [ratedUserId, title, msg, type]);

        // Emit Socket Event
        if (global.io) {
            global.io.to(`user_${ratedUserId}`).emit('notification', {
                title, message: msg, type, created_at: new Date()
            });
        }

        // Email Notification
        try {
            // const [userRows] = await pool.execute('SELECT email FROM users WHERE id = ?', [ratedUserId]);
            const { rows: userRows } = await pool.query('SELECT email FROM users WHERE id = $1', [ratedUserId]);
            if (userRows.length > 0) {
                // Calculate new trust score
                // const trustQuery = `SELECT AVG(stars) AS avg_stars FROM ratings WHERE rated_user_id = ?`;
                // const [trustRows] = await pool.execute(trustQuery, [ratedUserId]);
                const { rows: trustRows } = await pool.query('SELECT AVG(stars) AS avg_stars FROM ratings WHERE rated_user_id = $1', [ratedUserId]);
                let avgStars = parseFloat(trustRows[0].avg_stars);
                let newTrustScore = 100;
                if (!isNaN(avgStars)) {
                    newTrustScore = Math.round((avgStars / 5) * 1000) / 10;
                }
                await sendRatingReceivedEmail(userRows[0].email, stars, newTrustScore);

                // --- NEW: Low Trust Warning System ---
                if (avgStars < 2) {
                    const warningMsg = `Warning: Your Trust Score has dropped to ${avgStars.toFixed(1)} stars. Low trust scores reduce your visibility in the swap feed. Please maintain positive interactions to improve your score.`;
                    const warningTitle = 'Trust Score Warning';
                    
                    // 1. Save Notification
                    // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [ratedUserId, warningTitle, warningMsg, 'warning']);
                    await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [ratedUserId, warningTitle, warningMsg, 'warning']);
                    
                    // 2. Socket Alert
                    if (global.io) {
                        global.io.to(`user_${ratedUserId}`).emit('notification', {
                            title: warningTitle,
                            message: warningMsg,
                            type: 'warning',
                            created_at: new Date()
                        });
                    }

                    // 3. Warning Email
                    const { sendTrustWarningEmail } = require('../utils/emailService');
                    await sendTrustWarningEmail(userRows[0].email, avgStars);
                }
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
        // const query = 'SELECT id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50';
        // const [rows] = await pool.execute(query, [userId]);
        const { rows } = await pool.query('SELECT id, message, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
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
        // const query = 'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?';
        // await pool.execute(query, [notifId, userId]);
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [notifId, userId]);
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

        // const [matchRows] = await pool.execute(candidateQuery, queryParams);
        const { rows: matchRows } = await pool.query(candidateQuery, queryParams);

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
        // const [swapRows] = await pool.execute('SELECT type, remaining_amount, location, status FROM swaps WHERE id = ? AND user_id = ?', [swapId, userId]);
        const { rows: swapRows } = await pool.query('SELECT type, remaining_amount, location, status FROM swaps WHERE id = $1 AND user_id = $2', [swapId, userId]);
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

            // const [pRows] = await pool.execute('SELECT remaining_amount, user_id, status FROM swaps WHERE id = ? AND status = "active"', [candidateId]);
            const { rows: pRows } = await pool.query('SELECT remaining_amount, user_id, status FROM swaps WHERE id = $1 AND status = \'active\'', [candidateId]);
            if (pRows.length === 0) continue; // Partner was taken

            const candidateSwap = pRows[0];
            const candidateRemaining = parseFloat(candidateSwap.remaining_amount);

            let actualChunk = Math.min(requestedChunk, candidateRemaining, remainingNeeded);
            if (actualChunk <= 0) continue;

            const newCandidateRemaining = candidateRemaining - actualChunk;
            const candidateStatus = newCandidateRemaining <= 0 ? 'matched' : 'active';

            /*
            await pool.execute(
                'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time), is_selected = TRUE, selection_group_id = ?, partner_priority_rank = ? WHERE id = ?',
                [newCandidateRemaining, candidateStatus, candidateStatus, selectionGroupId, i + 1, candidateId]
            );
            */
            await pool.query(
                'UPDATE swaps SET remaining_amount = $1, status = $2, match_time = CASE WHEN $3 = \'matched\' THEN NOW() ELSE match_time END, is_selected = TRUE, selection_group_id = $4, partner_priority_rank = $5 WHERE id = $6',
                [newCandidateRemaining, candidateStatus, candidateStatus, selectionGroupId, i + 1, candidateId]
            );

            // const [childResult] = await pool.execute(`
            //     INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
            //     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
            // `, [
            //     userId, mySwap.type, actualChunk, actualChunk, 0, mySwap.location, 'matched', candidateSwap.user_id, swapId, candidateId
            // ]);
            const { rows: childResultRows } = await pool.query(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10) RETURNING id
            `, [
                userId, mySwap.type, actualChunk, actualChunk, 0, mySwap.location, 'matched', candidateSwap.user_id, swapId, candidateId
            ]);

            matchedChunks.push({
                partnerId: candidateSwap.user_id,
                chunkAmount: actualChunk,
                childSwapId: childResultRows[0].id,
                candidateParentId: candidateId,
                remainingNeededAfter: remainingNeeded - actualChunk
            });

            remainingNeeded -= actualChunk;
        }

        const finalParentStatus = remainingNeeded <= 0 ? 'matched' : 'active';
        /*
        await pool.execute(
            'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time) WHERE id = ?',
            [remainingNeeded, finalParentStatus, finalParentStatus, swapId]
        );
        */
        await pool.query(
            'UPDATE swaps SET remaining_amount = $1, status = $2, match_time = CASE WHEN $3 = \'matched\' THEN NOW() ELSE match_time END WHERE id = $4',
            [remainingNeeded, finalParentStatus, finalParentStatus, swapId]
        );

        if (matchedChunks.length > 0) {
            const { sendPartialMatchEmail } = require('../utils/emailService');
            for (const chunk of matchedChunks) {
                const pId = chunk.partnerId;
                const chunkAmt = chunk.chunkAmount;

                const msg = `Match Confirmed! ₹${chunkAmt} of a swap request has been locked with you!`;
                // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [userId, 'Partner Selected', msg, 'match']);
                // await pool.execute('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [pId, 'Partner Selected', msg, 'match']);
                await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [userId, 'Partner Selected', msg, 'match']);
                await pool.query('INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)', [pId, 'Partner Selected', msg, 'match']);

                if (global.io) {
                    global.io.to(`user_${userId}`).emit('notification', { title: 'Partner Selected', message: msg, type: 'match', created_at: new Date() });
                    global.io.to(`user_${pId}`).emit('notification', { title: 'Partner Selected', message: msg, type: 'match', created_at: new Date() });
                }

                (async () => {
                    try {
                        // const [meRows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);
                        // const [partnerRows] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [pId]);
                        const { rows: meRows } = await pool.query('SELECT email, name FROM users WHERE id = $1', [userId]);
                        const { rows: partnerRows } = await pool.query('SELECT email, name FROM users WHERE id = $1', [pId]);

                        if (meRows.length > 0 && partnerRows.length > 0) {
                            const me = meRows[0];
                            const partner = partnerRows[0];
                            const oppositeType = mySwap.type === 'need_cash' ? 'need_upi' : 'need_cash';

                            await sendPartialMatchEmail(me.email, chunkAmt, chunk.remainingNeededAfter, partner.name, mySwap.type === 'need_cash' ? 'Need Cash' : 'Need UPI', mySwap.location);

                            // const [pRow] = await pool.execute('SELECT remaining_amount FROM swaps WHERE id = ?', [chunk.candidateParentId]);
                            const { rows: pRow } = await pool.query('SELECT remaining_amount FROM swaps WHERE id = $1', [chunk.candidateParentId]);
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
        // await pool.execute(
        //     'UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = ?',
        //     [userId]
        // );
        await pool.query(
            'UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = $1',
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
        // 1. Fetch user's auto_match preference and location details
        // const [userRows] = await pool.execute('SELECT auto_match, latitude, longitude, search_radius FROM users WHERE id = ?', [userId]);
        const { rows: userRows } = await pool.query('SELECT auto_match, latitude, longitude, search_radius FROM users WHERE id = $1', [userId]);
        const userAutoMatch = userRows.length > 0 ? (userRows[0].auto_match === 1 || userRows[0].auto_match === true) : true;
        const userLat = userRows.length > 0 ? userRows[0].latitude : null;
        const userLng = userRows.length > 0 ? userRows[0].longitude : null;
        const userRadius = userRows.length > 0 ? (userRows[0].search_radius || 300) : 300;

        // 2. Fetch user's active swaps to identify potential "Best Matches"
        /*
        const [myActiveSwaps] = await pool.execute(
            'SELECT amount, type FROM swaps WHERE user_id = ? AND (status = "active" OR status = "open")',
            [userId]
        );
        */
        const { rows: myActiveSwaps } = await pool.query(
            'SELECT amount, type FROM swaps WHERE user_id = $1 AND (status = \'active\' OR status = \'open\')',
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
              s.latitude as creator_lat,
              s.longitude as creator_lng,
              s.remaining_amount as amount,
              s.type,
              s.status,
              s.is_edited,
              s.location,
              s.created_at,
              (SELECT AVG(stars) FROM ratings WHERE rated_user_id = u.id) as trustScore
            FROM swaps s
            JOIN users u ON s.user_id = u.id
            FROM swaps s
            JOIN users u ON s.user_id = u.id
            WHERE (LOWER(s.status) = 'active' OR LOWER(s.status) = 'open') AND s.user_id != $1
        `;

        if (minAmount) {
            query += " AND s.remaining_amount >= $" + (queryParams.length + 1);
            queryParams.push(parseFloat(minAmount));
        }

        if (maxAmount) {
            query += " AND s.remaining_amount <= $" + (queryParams.length + 1);
            queryParams.push(parseFloat(maxAmount));
        }

        if (type === 'UPI') {
            query += " AND s.type = 'need_upi'";
        } else if (type === 'CASH') {
            query += " AND s.type = 'need_cash'";
        }
        
        // const [rows] = await pool.execute(query, queryParams);
        const { rows } = await pool.query(query, queryParams);

        // Fetch userAmount for sorting
        let userAmount = 0;
        /*
        const [lastReqRows] = await pool.execute(
            'SELECT amount FROM swaps WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        */
        const { rows: lastReqRows } = await pool.query(
            'SELECT amount FROM swaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        if (lastReqRows.length > 0) {
            userAmount = parseFloat(lastReqRows[0].amount);
        }

        // Helper function for distance
        function getDistance(lat1, lon1, lat2, lon2) {
            if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
            const R = 6371e3;
            const phi1 = lat1 * Math.PI / 180;
            const phi2 = lat2 * Math.PI / 180;
            const deltaPhi = (lat2 - lat1) * Math.PI / 180;
            const deltaLambda = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // 4. Transform and Filter
        const enrichedSwaps = rows.map(swap => {
            const swapAmount = parseFloat(swap.amount);
            const oppositeType = swap.type === 'need_cash' ? 'need_upi' : 'need_cash';
            
            // Check if this swap is a "Best Match" (exact amount and compatible type)
            const isBestMatch = myActiveSwaps.some(mySwap => 
                parseFloat(mySwap.amount) === swapAmount && mySwap.type === oppositeType
            );

            const dist = getDistance(userLat, userLng, swap.creator_lat, swap.creator_lng);

            return { ...swap, isBestMatch, distanceVal: dist };
        });

        let finalSwaps = enrichedSwaps;

        if (userLat != null && userLng != null) {
            // Apply location filter. If creator location is missing, distanceVal is null, we can choose to show it (fallback) or hide it.
            // Requirement: "If user location is not available: Show all swaps." Here user location IS available.
            // Creator location missing means we can't filter. Let's include them for safety, or exclude.
            // Prompt says "Only include swaps where: distance <= search_radius"
            finalSwaps = finalSwaps.filter(s => s.distanceVal === null || s.distanceVal <= userRadius);
        }

        if (userAutoMatch) {
            // IF auto_match = ON, do NOT show exact matches in feed
            finalSwaps = enrichedSwaps.filter(s => !s.isBestMatch);
            if (userLat != null && userLng != null) {
                finalSwaps = finalSwaps.filter(s => s.distanceVal === null || s.distanceVal <= userRadius);
            }
        }

        // Format distance and delete raw val
        finalSwaps = finalSwaps.map(s => {
            if (s.distanceVal !== null) {
                s.distance = Math.round(s.distanceVal) + "m";
            } else {
                s.distance = "Location unavailable";
            }
            return s;
        });

        // Apply sorting: 
        // 0. Trust Tier (Score >= 2 before Score < 2)
        // 1. Nearest distance, 2. Higher trust score, 3. Latest created
        finalSwaps.sort((a, b) => {
            // 0. Trust Tier Check (Visibility Reduction for < 2 stars)
            const scoreA = parseFloat(a.trustScore) || 0;
            const scoreB = parseFloat(b.trustScore) || 0;
            
            const isLowTrustA = scoreA < 2;
            const isLowTrustB = scoreB < 2;

            if (isLowTrustA !== isLowTrustB) {
                return isLowTrustA ? 1 : -1; // Low-trust users go to the bottom
            }

            // 1. Nearest Distance
            const distA = a.distanceVal;
            const distB = b.distanceVal;
            if (distA !== null && distB !== null) {
                const diff = distA - distB;
                if (Math.abs(diff) > 1) { 
                    return diff;
                }
            } else if (distA !== null && distB === null) {
                return -1; 
            } else if (distA === null && distB !== null) {
                return 1;
            }

            // 2. Higher Trust Score (Within same tier)
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            // 3. Latest Created
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
        const { swapId, mode, parentSwapId } = req.body;
        const currentUserId = req.user?.id || req.body.userId || req.session?.userId;

        console.log("Current User:", currentUserId);
        console.log("Mode:", mode, "ParentSwapId:", parentSwapId);

        if (!swapId) {
            return res.status(400).json({ error: "swapId missing" });
        }

        if (!currentUserId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        // const [swapRows] = await pool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);
        const { rows: swapRows } = await pool.query('SELECT * FROM swaps WHERE id = $1', [swapId]);
        const swap = swapRows.length > 0 ? swapRows[0] : null;

        if (!swap) {
            return res.status(404).json({ error: "Swap not found" });
        }

        if (Number(swap.user_id) === Number(currentUserId)) {
            return res.status(400).json({ error: "Cannot accept your own swap" });
        }

        const validStatuses = ['active', 'open', 'pending'];
        if (!validStatuses.includes(swap.status.toLowerCase())) {
            return res.status(400).json({ error: "Swap already matched or inactive" });
        }

        let myFinalSwapId = null;

        if (mode === 'continue' && parentSwapId) {
            // --- PARTIAL MERGE LOGIC ---
            // const [pRows] = await pool.execute('SELECT * FROM swaps WHERE id = ? AND user_id = ?', [parentSwapId, currentUserId]);
            const { rows: pRows } = await pool.query('SELECT * FROM swaps WHERE id = $1 AND user_id = $2', [parentSwapId, currentUserId]);
            if (pRows.length === 0) return res.status(404).json({ error: "Parent swap not found" });
            
            const parentSwap = pRows[0];
            const matchAmount = parseFloat(swap.remaining_amount || swap.amount);
            const parentRemaining = parseFloat(parentSwap.remaining_amount);

            if (parentRemaining < matchAmount) {
                return res.status(400).json({ error: "Insufficient remaining amount in your swap to cover this match." });
            }

            // Deduct from parent
            const newRemaining = parentRemaining - matchAmount;
            const newParentStatus = newRemaining <= 0 ? 'matched' : 'active';
            
            /*
            await pool.execute(
                'UPDATE swaps SET remaining_amount = ?, status = ?, match_time = IF(? = "matched", NOW(), match_time) WHERE id = ?',
                [newRemaining, newParentStatus, newParentStatus, parentSwapId]
            );
            */
            await pool.query(
                'UPDATE swaps SET remaining_amount = $1, status = $2, match_time = CASE WHEN $3 = \'matched\' THEN NOW() ELSE match_time END WHERE id = $4',
                [newRemaining, newParentStatus, newParentStatus, parentSwapId]
            );

            // Create a new child swap for User B to represent this match
            /*
            const [childResult] = await pool.execute(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
            `, [
                currentUserId, parentSwap.type, matchAmount, matchAmount, 0, parentSwap.location, 'matched', swap.user_id, parentSwapId, swapId
            ]);
            */
            const { rows: childResultRows } = await pool.query(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, parent_swap_id, matched_parent_swap_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10) RETURNING id
            `, [
                currentUserId, parentSwap.type, matchAmount, matchAmount, 0, parentSwap.location, 'matched', swap.user_id, parentSwapId, swapId
            ]);
            
            myFinalSwapId = childResultRows[0].id;
            console.log(`Merged match into existing swap ${parentSwapId}. New child swap: ${myFinalSwapId}`);

        } else {
            // --- CREATE NEW (Standard Logic) ---
            const oppositeType = swap.type === 'need_cash' ? 'need_upi' : 'need_cash';
            /*
            const [childResult] = await pool.execute(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, matched_parent_swap_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            `, [
                currentUserId, oppositeType, swap.amount, swap.amount, 0, swap.location, 'matched', swap.user_id, swapId
            ]);
            */
            const { rows: childResultRows } = await pool.query(`
                INSERT INTO swaps (user_id, type, amount, total_amount, remaining_amount, location, status, matched_user_id, match_time, matched_parent_swap_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9) RETURNING id
            `, [
                currentUserId, oppositeType, swap.amount, swap.amount, 0, swap.location, 'matched', swap.user_id, swapId
            ]);
            myFinalSwapId = childResultRows[0].id;
        }

        // Update the requester's swap (the one being accepted)
        /*
        await pool.execute(`
          UPDATE swaps
          SET status = 'matched',
              matched_user_id = ?,
              match_time = NOW()
          WHERE id = ?
        `, [currentUserId, swapId]);
        */
        await pool.query(`
          UPDATE swaps
          SET status = 'matched',
              matched_user_id = $1,
              match_time = NOW()
          WHERE id = $2
        `, [currentUserId, swapId]);

        // Insert into matches table for convenience
        /*
        await pool.execute(`
          INSERT INTO matches (swap_id, requester_id, accepter_id, status, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [
          swapId,
          swap.user_id,
          currentUserId,
          "matched"
        ]);
        */
        await pool.query(`
          INSERT INTO matches (swap_id, requester_id, accepter_id, status, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [
          swapId,
          swap.user_id,
          currentUserId,
          "matched"
        ]);

        console.log("Resetting notification state for user:", currentUserId);
        // await pool.execute(
        //     'UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = ?',
        //     [currentUserId]
        // );
        await pool.query(
            'UPDATE users SET last_best_match_score = 0, last_notified_at = NULL WHERE id = $1',
            [currentUserId]
        );

        // --- NEW: Send Email Notifications to both parties ---
        try {
            // const [requesterRows] = await pool.execute('SELECT name, email FROM users WHERE id = ?', [swap.user_id]);
            // const [accepterRows] = await pool.execute('SELECT name, email FROM users WHERE id = ?', [currentUserId]);
            const { rows: requesterRows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [swap.user_id]);
            const { rows: accepterRows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [currentUserId]);

            if (requesterRows.length > 0 && accepterRows.length > 0) {
                const requester = requesterRows[0];
                const accepter = accepterRows[0];
                const { sendSwapMatchedEmail } = require('../utils/emailService');

                // 1. Notify Requester (the one who posted the swap)
                // Their partner is the CURRENT USER (Accepter)
                await sendSwapMatchedEmail(
                    requester.email, 
                    accepter.name, 
                    accepter.email, 
                    swap.type, 
                    swap.amount, 
                    swap.location
                );

                // 2. Notify Accepter (the one who clicked "Accept")
                // Their partner is the Original Requester
                const oppositeType = swap.type === 'need_cash' ? 'need_upi' : 'need_cash';
                await sendSwapMatchedEmail(
                    accepter.email, 
                    requester.name, 
                    requester.email, 
                    oppositeType, 
                    swap.amount, 
                    swap.location
                );
            }
        } catch (emailError) {
            console.error("Email notification failed during acceptSwap:", emailError);
            // We don't fail the whole request if email fails
        }

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
        // const [rows] = await pool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);
        const { rows } = await pool.query('SELECT * FROM swaps WHERE id = $1', [swapId]);

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
        // await pool.execute('DELETE FROM swaps WHERE id = ?', [swapId]);
        await pool.query('DELETE FROM swaps WHERE id = $1', [swapId]);

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
        const [rows] = await pool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);

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
        /*
        await pool.execute(`
            UPDATE swaps 
            SET type = ?, amount = ?, total_amount = ?, remaining_amount = ?, location = ?, created_at = NOW(), is_edited = TRUE 
            WHERE id = ?
        `, [type, amount, amount, amount, location, swapId]);
        */
        await pool.query(`
            UPDATE swaps 
            SET type = $1, amount = $2, total_amount = $3, remaining_amount = $4, location = $5, created_at = NOW(), is_edited = TRUE 
            WHERE id = $6
        `, [type, amount, amount, amount, location, swapId]);

        res.json({ success: true, message: 'Swap updated successfully.' });

    } catch (error) {
        console.error('Update Swap Error:', error);
        res.status(500).json({ success: false, error: 'An error occurred while updating the swap.' });
    }
};
