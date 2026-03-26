const cron = require('node-cron');
const mysql = require('mysql2');
const { sendPendingReminderEmail, sendBestMatchFoundEmail } = require('../utils/emailService');

// Database connection pool
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

// Fetch settings from the database
async function getSettings() {
    try {
        const [rows] = await promisePool.execute("SELECT setting_key, setting_value FROM settings");
        const settings = {};
        rows.forEach(row => settings[row.setting_key] = row.setting_value);

        return {
            intervalHours: parseInt(settings['reminder_interval_hours'] || '1', 10),
            maxReminders: parseInt(settings['max_reminders'] || '6', 10)
        };
    } catch (e) {
        console.error('Error fetching settings for cron:', e);
        return { intervalHours: 1, maxReminders: 6 };
    }
}

// The core checker function
async function checkPendingSwaps() {
    console.log('[CRON Service] Running check for pending swaps...');
    try {
        const { intervalHours, maxReminders } = await getSettings();

        // Find all swaps actively in "matched" status
        // AND where (last_reminder_sent IS NULL OR last_reminder_sent <= NOW() - interval)
        const query = `
            SELECT s.*, 
                   u1.email AS creator_email, u1.name AS creator_name,
                   u2.email AS acceptor_email, u2.name AS acceptor_name
            FROM swaps s
            JOIN users u1 ON s.user_id = u1.id
            JOIN users u2 ON s.matched_user_id = u2.id
            WHERE s.status = 'matched'
            AND (
                s.last_reminder_sent IS NULL 
                OR s.last_reminder_sent <= DATE_SUB(NOW(), INTERVAL ? HOUR)
            )
        `;

        const [swaps] = await promisePool.execute(query, [intervalHours]);

        for (const swap of swaps) {
            const nextCount = swap.reminder_count + 1;

            // Calculate pending duration manually for the email UI
            const matchTime = new Date(swap.match_time || swap.created_at);
            const now = new Date();
            const diffMs = now - matchTime;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const displayHours = diffHours < 1 ? 1 : diffHours; // minimum 1 hour reading

            // If creator didn't complete
            if (!swap.creator_completed) {
                await sendPendingReminderEmail(
                    swap.creator_email,
                    swap.acceptor_name,
                    swap.amount,
                    swap.location,
                    displayHours,
                    nextCount > maxReminders ? 5 : nextCount // If past max, trigger final template
                );
            }

            // If acceptor didn't complete
            if (!swap.acceptor_completed) {
                await sendPendingReminderEmail(
                    swap.acceptor_email,
                    swap.creator_name,
                    swap.amount,
                    swap.location,
                    displayHours,
                    nextCount > maxReminders ? 5 : nextCount
                );
            }

            // Update database tracking
            const updateTracking = `
                UPDATE swaps 
                SET reminder_count = ?, last_reminder_sent = NOW() 
                WHERE id = ?
            `;
            await promisePool.execute(updateTracking, [nextCount, swap.id]);
        }

        console.log(`[CRON Service] Processed ${swaps.length} pending swaps.`);
    } catch (error) {
        console.error('[CRON Service] Error checking pending swaps:', error);
    }
}

async function checkBestMatches() {
    console.log('[CRON Service] Running check for best matches (Smart Notifications)...');
    try {
        // 1. Fetch users who have auto_match disabled
        const [users] = await promisePool.execute(`
            SELECT id, email, name, last_best_match_score, last_notified_at 
            FROM users 
            WHERE auto_match = 0
        `);

        for (const user of users) {
             // 2. Fetch user's active swaps
             const [mySwaps] = await promisePool.execute(
                 'SELECT id, amount, type FROM swaps WHERE user_id = ? AND (status = "active" OR status = "open")',
                 [user.id]
             );
 
             if (mySwaps.length === 0) continue;
 
             // 3. Fetch potential partners (active swaps from others, compatible types)
             // We calculate trust_score (AVG ratings / 5) on the fly
             const [partners] = await promisePool.execute(`
                 SELECT s.id, s.amount, s.type, s.location, u.name as partner_name,
                        (SELECT IFNULL(AVG(stars), 5) FROM ratings WHERE rated_user_id = u.id) as partner_avg_rating
                 FROM swaps s
                 JOIN users u ON s.user_id = u.id
                 WHERE (s.status = 'active' OR s.status = 'open') AND s.user_id != ?
             `, [user.id]);
 
             let bestMatchForUser = null;
             let highestScoreForUser = -1;
 
             for (const mySwap of mySwaps) {
                 const myAmt = parseFloat(mySwap.amount);
                 const oppositeType = mySwap.type === 'need_cash' ? 'need_upi' : 'need_cash';

                for (const partner of partners) {
                    if (partner.type !== oppositeType) continue;

                    const pAmt = parseFloat(partner.amount);
                    const pTrust = parseFloat(partner.partner_avg_rating || 5) / 5; // normalize 1-5 to 0-1

                    // Formula: score = (1 / (1 + abs(myAmt - pAmt))) * 0.7 + (trustScore * 0.3)
                    const amtDiff = Math.abs(myAmt - pAmt);
                    const proximityScore = 1 / (1 + amtDiff);
                    const currentScore = (proximityScore * 0.7) + (pTrust * 0.3);

                    if (currentScore > highestScoreForUser) {
                        highestScoreForUser = currentScore;
                        bestMatchForUser = {
                            myAmount: myAmt,
                            partnerName: partner.partner_name,
                            partnerAmount: pAmt,
                            partnerType: partner.type,
                            partnerLocation: partner.location
                        };
                    }
                }
            }

            // 4. Check if we should notify (Smart Policy: only if better score AND at most once every 10 mins)
            const lastScore = parseFloat(user.last_best_match_score || 0);
            const neverNotified = !user.last_notified_at;
            const lastNotified = user.last_notified_at ? new Date(user.last_notified_at) : null;
            const minutesSinceLast = lastNotified ? (new Date() - lastNotified) / (1000 * 60) : 999;

            if (bestMatchForUser && (highestScoreForUser > lastScore || neverNotified) && minutesSinceLast >= 10) {
                console.log(`[CRON Service] Sending best match alert to ${user.email} (Score: ${highestScoreForUser.toFixed(4)}, Prev: ${lastScore.toFixed(4)})`);
                
                await sendBestMatchFoundEmail(
                    user.email,
                    bestMatchForUser.myAmount,
                    bestMatchForUser.partnerName,
                    bestMatchForUser.partnerAmount,
                    bestMatchForUser.partnerType,
                    bestMatchForUser.partnerLocation
                );

                // 5. Update user record
                await promisePool.execute(
                    'UPDATE users SET last_best_match_score = ?, last_notified_at = NOW() WHERE id = ?',
                    [highestScoreForUser, user.id]
                );
            }
        }
    } catch (error) {
        console.error('[CRON Service] Error in checkBestMatches:', error);
    }
}

// Start the cron job
function startCronService() {
    console.log('Automated Email Cron Service Initialized.');
    
    // 1. Pending Swaps Reminder (Every hour)
    cron.schedule('0 * * * *', async () => {
        await checkPendingSwaps();
    });

    // 2. Best Match Smart Notifications (Every 10 minutes)
    // Run every 10 minutes to support the 10-min cooldown
    cron.schedule('*/10 * * * *', async () => {
        await checkBestMatches();
    });
}

module.exports = {
    startCronService,
    checkPendingSwaps,
    checkBestMatches // Export for manual execution/testing
};
