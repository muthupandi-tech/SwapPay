const nodemailer = require('nodemailer');
const mysql = require('mysql2');

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

// Check if email notifications are globally enabled in the database
async function isEmailNotificationEnabled() {
    try {
        const [rows] = await promisePool.execute("SELECT setting_value FROM settings WHERE setting_key = 'email_notifications_enabled'");
        if (rows.length > 0) {
            return rows[0].setting_value === 'true';
        }
        return true; // Default to true if setting is missing for any reason
    } catch (error) {
        console.error('Error checking email settings:', error);
        return false; // Safely default to false on database error
    }
}

// Global transporter for nodemailer
let transporter = null;
let senderEmail = "notifications@swappay.com";

async function getTransporter() {
    if (transporter) return transporter;

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_USER !== 'your_email@gmail.com') {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        console.log(`[Email Service] Configured with Gmail for ${process.env.EMAIL_USER}`);
        senderEmail = process.env.EMAIL_USER;
    } else {
        console.log("[Email Service] No valid Gmail in .env. Falling back to Mock Ethereal Email.");
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        senderEmail = testAccount.user;
    }
    return transporter;
}

/**
 * Common HTML wrapper for all emails to maintain branding
 */
function getEmailTemplateWrapper(title, content) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #0f172a, #1e293b); border-radius: 8px 8px 0 0;">
            <h1 style="color: #f8fafc; margin: 0; font-size: 24px;">SwapPay</h1>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #1e293b; margin-top: 0;">${title}</h2>
            <div style="color: #475569; line-height: 1.6;">
                ${content}
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
                SwapPay - Peer-to-Peer Campus Exchange Platform<br/>
                For support, contact support@swappay.com
            </p>
        </div>
    </div>
    `;
}

/**
 * 0. Swap Created Email Template
 */
async function sendSwapCreatedEmail(toEmail, swapType, amount, location) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const typeLabel = swapType === 'need_cash' ? 'Need Cash' : 'Need UPI';

    const content = `
        <p>Your swap request has been successfully created and is now visible to peers on the campus.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Type:</strong></td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${typeLabel}</td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Amount:</strong></td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #10b981; font-weight: bold;">₹${amount}</td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Location:</strong></td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${location}</td></tr>
        </table>
        
        <p>We will notify you immediately once a peer accepts your request!</p>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: "📩 Swap Request Created Successfully",
        html: getEmailTemplateWrapper("Swap Request Created", content)
    };

    try {
        const info = await t.sendMail(mailOptions);
        console.log(`Sent Swap Created Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 1. Swap Matched Email Template
 */
async function sendSwapMatchedEmail(toEmail, partnerName, partnerEmail, swapType, amount, location) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const typeLabel = swapType === 'need_cash' ? 'Needs Cash' : 'Needs UPI';

    const content = `
        <p>Great news! Your swap request has been matched instantly.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 20px 0;">
            <div style="background-color: #3b82f6; color: white; padding: 10px 15px; font-weight: bold;">Match Details</div>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; width: 35%; color: #64748b;"><strong>Partner Name:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0;">${partnerName}</td></tr>
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Partner Email:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:${partnerEmail}" style="color: #3b82f6;">${partnerEmail}</a></td></tr>
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Type:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0;">${typeLabel}</td></tr>
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Amount:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #10b981; font-weight: bold; font-size: 1.1em;">₹${amount}</td></tr>
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Location:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0;">${location}</td></tr>
                <tr><td style="padding: 12px 15px; color: #64748b;"><strong>Match Time:</strong></td><td style="padding: 12px 15px;">${new Date().toLocaleString()}</td></tr>
            </table>
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Safety Tip:</strong> Meet in a public place, preferably during daylight hours, and never share OTPs or physical cards.</p>
        </div>
        
        <p>Please head to the meeting location to complete your swap safely. Once finished, you must log into the platform to confirm completion.</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open SwapPay Dashboard</a>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: "🎉 Your Swap Request is Matched!",
        html: getEmailTemplateWrapper("Swap Matched", content)
    };

    try {
        const info = await t.sendMail(mailOptions);
        console.log(`Sent Swap Matched Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 2. Swap Completed Email Template
 */
async function sendSwapCompletedEmail(toEmail, partnerName, amount) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const content = `
        <p>Your swap of <strong>₹${amount}</strong> with <strong>${partnerName}</strong> has been successfully completed.</p>
        <p>Thank you for using SwapPay. Helping peers exchange money securely makes the whole campus experience better.</p>
        <div style="text-align: center; margin: 30px 0;">
            <p><strong>How was your experience?</strong></p>
            <p>Please log in to your dashboard to rate your swap partner. This helps keep our community trustworthy and safe.</p>
            <a href="http://localhost:3000/dashboard" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Leave a Rating</a>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: "✅ Swap Completed Successfully",
        html: getEmailTemplateWrapper("Swap Completed", content)
    };

    try {
        const info = await t.sendMail(mailOptions);
        console.log(`Sent Swap Completed Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 3. Rating Received Email Template
 */
async function sendRatingReceivedEmail(toEmail, stars, newTrustScore) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const starDisplay = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);

    const content = `
        < p > You've received a new rating from a recent swap partner!</p>
            < div style = "text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px;" >
            <div style="font-size: 32px; letter-spacing: 5px; margin-bottom: 10px;">${starDisplay}</div>
            <p style="margin: 0; color: #475569; font-size: 18px;"><strong>${stars} / 5 Stars</strong></p>
        </div >
        <p>Your new calculated Trust Score is <strong>${newTrustScore}%</strong>.</p>
        <p>Thank you for being a reliable member of the SwapPay community!</p>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: "⭐ You Received a New Rating",
        html: getEmailTemplateWrapper("New Rating Received", content)
    };

    try {
        const info = await t.sendMail(mailOptions);
        console.log(`Sent Rating Received Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 4. Pending Completion Reminder Template (Dynamic Tones based on Count)
 */
async function sendPendingReminderEmail(toEmail, partnerName, amount, location, pendingDurationHours, count) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    let subject = "";
    let headerTitle = "";
    let bodyContent = "";
    let urgencyColor = "#3b82f6"; // default blue

    // 1st reminder -> Friendly reminder
    if (count === 1) {
        subject = "⏳ Friendly Reminder: Confirm Swap Completion";
        headerTitle = "Pending Swap Confirmation";
        bodyContent = `
            <p>Hi there,</p>
            <p>It has been <strong>${pendingDurationHours} hour(s)</strong> since you matched with <strong>${partnerName}</strong> for a swap of <strong>₹${amount}</strong> at <strong>${location}</strong>.</p>
            <p>If you have already met up and completed the exchange, please don't forget to mark it as completed on your dashboard!</p>
            <p><em>You have not confirmed completion yet.</em></p>
        `;
    }
    // 2nd reminder -> Partner waiting
    else if (count === 2) {
        subject = "⏳ Your Partner is Waiting: Complete Your Swap";
        headerTitle = "Confirmation Needed";
        urgencyColor = "#f59e0b"; // yellow/orange
        bodyContent = `
            <p>Hello again,</p>
            <p>Your swap partner <strong>${partnerName}</strong> is still waiting for you to confirm the swap completion.</p>
            <p>It's been <strong>${pendingDurationHours} hours</strong> since the match for <strong>₹${amount}</strong> at <strong>${location}</strong>.</p>
            <p style="color: ${urgencyColor}; font-weight: bold;">Your partner is waiting on you to finalize this transaction.</p>
            <p>Log in now to confirm or contact your partner to resolve any issues.</p>
        `;
    }
    // 3rd reminder -> Swap delayed
    else if (count === 3) {
        subject = "⚠️ Swap Delayed: Confirmation Missing";
        headerTitle = "Swap Exchange Delayed";
        urgencyColor = "#d97706"; // darker orange
        bodyContent = `
            <p><strong>This is a delayed notice.</strong></p>
            <p>Your swap for <strong>₹${amount}</strong> with <strong>${partnerName}</strong> has been pending for <strong>${pendingDurationHours} hours</strong>.</p>
            <p>To maintain a high Trust Score and keep SwapPay reliable for everyone, prompt completions are expected.</p>
            <p style="color: ${urgencyColor}; font-weight: bold;">Swap still pending confirmation.</p>
        `;
    }
    // 4th reminder -> Action required
    else if (count === 4) {
        subject = "🚨 Action Required: Unconfirmed Swap Exchange";
        headerTitle = "Action Required Immediately";
        urgencyColor = "#ef4444"; // red
        bodyContent = `
            <p style="color: ${urgencyColor}; font-weight: bold;">Action Required.</p>
            <p>You have an aging, unconfirmed swap of <strong>₹${amount}</strong> with <strong>${partnerName}</strong> (Matched <strong>${pendingDurationHours} hours</strong> ago).</p>
            <p>Failing to confirm swaps may negatively impact your account standing.</p>
            <p>Please log in immediately and mark the swap as completed if the exchange took place.</p>
        `;
    }
    // 5+ reminder -> Auto-cancel warning
    else {
        subject = "❌ FINAL WARNING: Swap Auto-Cancel Notice";
        headerTitle = "Final Notice: Pending Swap";
        urgencyColor = "#b91c1c"; // dark red
        bodyContent = `
            <div style="border: 2px solid ${urgencyColor}; padding: 15px; border-radius: 6px; background-color: #fef2f2;">
                <h3 style="color: ${urgencyColor}; margin-top: 0;">Final Warning</h3>
                <p>Your swap with <strong>${partnerName}</strong> for <strong>₹${amount}</strong> has been pending for over <strong>${pendingDurationHours} hours</strong> with no action taken on your part.</p>
                <p>If this swap remains unconfirmed, it will be flagged for administrative review and potentially auto-canceled, which may result in an automated hold on your SwapPay account.</p>
            </div>
            <p><strong>Please confirm this swap immediately.</strong></p>
        `;
    }

    const ctaSection = `
        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="background-color: ${urgencyColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Confirm Swap Completion Now</a>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: subject,
        html: getEmailTemplateWrapper(headerTitle, bodyContent + ctaSection)
    };

    try {
        const info = await t.sendMail(mailOptions);
        console.log(`Sent Reminder Email (Count: ${count}) to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send reminder email to ${toEmail}:`, error);
    }
}

module.exports = {
    sendSwapCreatedEmail,
    sendSwapMatchedEmail,
    sendSwapCompletedEmail,
    sendRatingReceivedEmail,
    sendPendingReminderEmail
};
