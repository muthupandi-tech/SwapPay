const cron = require('node-cron');
const mysql = require('mysql2');
const { sendPendingReminderEmail } = require('../utils/emailService');

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

// Start the cron job
function startCronService() {
    console.log('Automated Email Cron Service Initialized.');
    // Run at the top of every hour: '0 * * * *'
    // To test frequently, one might use '*/5 * * * *'
    cron.schedule('0 * * * *', async () => {
        await checkPendingSwaps();
    });
}

module.exports = {
    startCronService,
    checkPendingSwaps // Export for manual execution/testing
};
