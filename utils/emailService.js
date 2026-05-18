const nodemailer = require('nodemailer');
// const mysql = require('mysql2');
const { Pool } = require('pg');

/*
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
*/

const pool = new Pool({
    host: "ep-wandering-salad-an98u8xz-pooler.c-6.us-east-1.aws.neon.tech",
    user: "neondb_owner",
    password: "npg_wX7MmeLB0FTU",
    database: "neondb",
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// Check if email notifications are globally enabled in the database
async function isEmailNotificationEnabled() {
    try {
        // const [rows] = await promisePool.execute("SELECT setting_value FROM settings WHERE setting_key = 'email_notifications_enabled'");
        const { rows } = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'email_notifications_enabled'");
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
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            connectionTimeout: 30000, // 30s connection timeout
            greetingTimeout: 30000,
            socketTimeout: 30000
        });
        senderEmail = process.env.EMAIL_USER;
        console.log(`[Email Service] Gmail transporter configured for ${process.env.EMAIL_USER}`);
        return transporter;
    }

    // No credentials available
    console.log("[Email Service] EMAIL_USER / EMAIL_PASS not set.");
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Email not configured on server. Please contact admin.');
    }

    // Dev fallback: Ethereal mock email
    console.log("[Email Service] Falling back to Mock Ethereal Email.");
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
 * DEVELOPMENT HELPER: Logs critical email content to the console
 * Useful when SMTP settings are invalid.
 */
function logCriticalEmailToConsole(title, to, payload) {
    console.log('\n' + '='.repeat(60));
    console.log(`[DEVELOPMENT FALLBACK] ${title.toUpperCase()}`);
    console.log(`TO: ${to}`);
    console.log(`CONTENT: ${payload}`);
    console.log('='.repeat(60) + '\n');
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
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Swap Created Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 0. Send OTP Verification Email
 */
async function sendOTPEmail(toEmail, otp) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const content = `
        <h3 style="color: #60a5fa; margin-top: 0;">Email Verification Required</h3>
        <p>Welcome to SwapPay! To complete your registration, please verify your email address.</p>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; color: #475569;">Your One-Time Password (OTP) is:</p>
            <div style="font-size: 36px; letter-spacing: 12px; margin-bottom: 10px; font-weight: 800; color: #1e293b; font-family: monospace;">${otp}</div>
        </div>
        
        
        <p style="color: #ef4444; font-weight: bold; text-align: center;">This OTP expires in exactly 5 minutes.</p>
        <p>If you did not attempt to register an account with us, please ignore this email safely.</p>
    `;

    // DEV FALLBACK: Log OTP to console so developer can see it if email fails
    logCriticalEmailToConsole("OTP Verification Code", toEmail, `YOUR OTP CODE IS: ${otp}`);

    const mailOptions = {
        from: `"SwapPay Verification" <${senderEmail}>`,
        to: toEmail,
        subject: "🔒 SwapPay OTP Verification",
        html: getEmailTemplateWrapper("Verify Your Email", content)
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent OTP Verification Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send OTP email to ${toEmail}:`, error);
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
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Swap Matched Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * Partial Swap Match Email Template
 */
async function sendPartialMatchEmail(toEmail, chunkAmt, remainingAmt, partnerName, partnerType, location) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const remainingText = remainingAmt > 0
        ? `<p style="color: #ea580c; font-weight: bold;">You still need ₹${remainingAmt} to fully complete your request. We will keep looking for more partners!</p>`
        : `<p style="color: #16a34a; font-weight: bold;">Your request is now fully matched! No remaining amount.</p>`;

    const content = `
        <p>Great news! A partial match of <strong>₹${chunkAmt}</strong> has been secured for your SwapPay request.</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Match Details:</strong></p>
            <ul style="margin: 0; padding-left: 20px; color: #475569;">
                <li><strong>Partner:</strong> ${partnerName}</li>
                <li><strong>Amount Matched:</strong> ₹${chunkAmt}</li>
                <li><strong>They Need:</strong> ${partnerType}</li>
                <li><strong>Meetup Location:</strong> ${location}</li>
            </ul>
        </div>
        
        ${remainingText}

        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Progress</a>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: `🔄 Partial Match Found: ₹${chunkAmt}`,
        html: getEmailTemplateWrapper("Partial Match", content)
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Partial Match Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 2. Swap Pending Confirmation Email Template
 */
async function sendPendingConfirmationEmail(toEmail, partnerName, amount, type, location, time) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const displayType = type === 'need_cash' ? 'Cash Swap' : 'UPI Swap';

    const content = `
        <h3 style="color: #60a5fa; margin-top: 0;">Partner Awaiting Confirmation</h3>
        <p>Your swap partner, <strong>${partnerName}</strong>, has marked your recent exchange as completed!</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Swap Details:</strong></p>
            <ul style="margin: 0; padding-left: 20px; color: #475569;">
                <li><strong>Amount:</strong> ₹${amount}</li>
                <li><strong>Type:</strong> ${displayType}</li>
                <li><strong>Location:</strong> ${location || 'Campus Area'}</li>
                <li><strong>Posted Time:</strong> ${time}</li>
            </ul>
        </div>

        <p>Please log in to your dashboard to confirm the completion and finalize the swap process.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Confirm Completion</a>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: "⏳ Action Required: Confirm Swap Completion",
        html: getEmailTemplateWrapper("Awaiting Confirmation", content)
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Pending Confirmation Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 3. Swap Completed Email Template
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
        const info = await sendWithFallback(t, mailOptions);
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
        <p>You've received a new rating from a recent swap partner!</p>
        <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <div style="font-size: 32px; letter-spacing: 5px; margin-bottom: 10px;">${starDisplay}</div>
            <p style="margin: 0; color: #475569; font-size: 18px;"><strong>${stars} / 5 Stars</strong></p>
        </div>
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
        const info = await sendWithFallback(t, mailOptions);
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
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Reminder Email (Count: ${count}) to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send reminder email to ${toEmail}:`, error);
    }
}

/**
 * Multiple Partners Available Email Template
 */
async function sendMultiplePartnersAvailableEmail(toEmail, requiredAmount, partnersArray) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    let partnersHtml = '';
    partnersArray.forEach(p => {
        const ratingDisplay = p.rating ? `⭐${parseFloat(p.rating).toFixed(1)}` : 'New';
        partnersHtml += `
            <li style="margin-bottom: 8px;">
                <strong>${p.name}</strong> — ₹${p.amount} — Rating: ${ratingDisplay} — ${p.location}
            </li>
        `;
    });

    const content = `
        <p>Great news! Multiple partners are available for your <strong>₹${requiredAmount}</strong> swap request.</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Available Partners:</strong></p>
            <ul style="margin: 0; padding-left: 20px; color: #475569;">
                ${partnersHtml}
            </ul>
        </div>
        
        <p>Log in to SwapPay to choose your preferred partners.</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Select Swap Partners</a>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Notifications" <${senderEmail}>`,
        to: toEmail,
        subject: `Multiple Swap Partners Available for Your ₹${requiredAmount} Request`,
        html: getEmailTemplateWrapper("Matches Found", content)
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Multiple Partners Available Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * Smart Notification: Best Match Found Email Template
 */
async function sendBestMatchFoundEmail(toEmail, myAmount, partnerName, partnerAmount, partnerType, partnerLocation) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const pTypeLabel = partnerType === 'need_cash' ? 'Needs Cash' : 'Needs UPI';

    const content = `
        <p>We've found a new, high-quality match for your active swap request of <strong>₹${myAmount}</strong>!</p>
        
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; overflow: hidden; margin: 20px 0;">
            <div style="background-color: #f59e0b; color: white; padding: 10px 15px; font-weight: bold;">🔥 Better Match Details</div>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #fde68a; width: 35%; color: #92400e;"><strong>Potential Partner:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #fde68a;">${partnerName}</td></tr>
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #fde68a; color: #92400e;"><strong>They Offer:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #fde68a; color: #10b981; font-weight: bold;">₹${partnerAmount}</td></tr>
                <tr><td style="padding: 12px 15px; border-bottom: 1px solid #fde68a; color: #92400e;"><strong>They Need:</strong></td><td style="padding: 12px 15px; border-bottom: 1px solid #fde68a;">${pTypeLabel}</td></tr>
                <tr><td style="padding: 12px 15px; color: #92400e;"><strong>Meetup Near:</strong></td><td style="padding: 12px 15px;">${partnerLocation}</td></tr>
            </table>
        </div>
        
        <p>This match is currently active on the platform. Log in now to view it and accept manually!</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Best Match</a>
        </div>
        
        <p style="font-size: 0.8rem; color: #94a3b8; text-align: center;">You are receiving this because you have auto-match disabled. We only alert you when we find a better score than your last notification!</p>
    `;

    const mailOptions = {
        from: `"SwapPay Smart Alerts" <${senderEmail}>`,
        to: toEmail,
        subject: "🔥 Better Swap Match Found!",
        html: getEmailTemplateWrapper("Better Match Found", content)
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Smart Notification (Best Match) to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send email to ${toEmail}:`, error);
    }
}

/**
 * 5. Low Trust Warning Email Template
 */
async function sendTrustWarningEmail(toEmail, currentStars) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const starDisplay = '⭐'.repeat(Math.round(currentStars)) + '☆'.repeat(5 - Math.round(currentStars));

    const content = `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px;">
            <h3 style="color: #ef4444; margin-top: 0;">⚠️ Low Trust Score Warning</h3>
            <p>We've noticed your current trust score has dropped to <strong>${currentStars.toFixed(1)} / 5 stars</strong>.</p>
            <div style="font-size: 24px; letter-spacing: 5px; margin: 15px 0;">${starDisplay}</div>
        </div>
        
        <p>At SwapPay, mutual trust is the foundation of our community. A low score significantly reduces your request visibility to other users.</p>
        
        <p><strong>To improve your score:</strong></p>
        <ul style="color: #475569; line-height: 1.6;">
            <li>Be prompt and communicative during swaps.</li>
            <li>Always meet in person and complete exchanges as agreed.</li>
            <li>Maintain respectful behavior towards your swap partners.</li>
        </ul>
        
        <p>Positive ratings on your next few swaps will quickly bring your score back up! We value your membership in our community and want to help you stay active.</p>
    `;

    const mailOptions = {
        from: `"SwapPay Safety Team" <${senderEmail}>`,
        to: toEmail,
        subject: "⚠️ Warning: Your Trust Score is Low",
        html: getEmailTemplateWrapper("Community Safety Notice", content)
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Trust Warning Email to ${toEmail}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send warning email to ${toEmail}:`, error);
    }
}

/**
 * Contact Developer Email Template
 */
async function sendContactEmail(name, email, message) {
    const t = await getTransporter();

    // Since this email goes to the developer, we can just use simple text or HTML.
    const content = `
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <hr>
            <p style="white-space: pre-wrap;">${message}</p>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Contact Form" <${senderEmail}>`,
        to: "swappay.official@gmail.com", // Updated as requested
        subject: "New Contact from SwapPay",
        html: getEmailTemplateWrapper("Developer Contact Form", content),
        replyTo: email
    };

    try {
        const info = await sendWithFallback(t, mailOptions);
        console.log(`Sent Contact Email from ${email}`);
        if (info.messageId && t.options.host === "smtp.ethereal.email") {
            console.log("Mock Email URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error(`[CRITICAL] Failed to send contact email:`, error);
        throw error;
    }
}

/**
 * Send Feedback/Issue Email to Admin
 */
async function sendFeedbackEmailToAdmin(userName, userEmail, type, category, message, rating) {
    const t = await getTransporter();

    const title = type === 'issue' ? "🚨 New Support Issue Reported" : "📝 New Feedback Received";
    const starRating = rating ? `Rating: ${'⭐'.repeat(rating)}` : '';

    const content = `
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p><strong>From:</strong> ${userName} (${userEmail})</p>
            <p><strong>Type:</strong> ${type.toUpperCase()}</p>
            <p><strong>Category:</strong> ${category || 'N/A'}</p>
            ${starRating ? `<p><strong>${starRating}</strong></p>` : ''}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
            <p style="white-space: pre-wrap; color: #1e293b;">${message}</p>
        </div>
    `;

    const mailOptions = {
        from: `"SwapPay Support" <${senderEmail}>`,
        to: "swappay.official@gmail.com",
        subject: `[${type.toUpperCase()}] ${category || 'General'} - from ${userName}`,
        html: getEmailTemplateWrapper(title, content),
        replyTo: userEmail
    };

    try {
        await sendWithFallback(t, mailOptions);
        console.log(`[Email Service] Feedback email sent to admin from ${userEmail}`);
    } catch (error) {
        console.error(`[CRITICAL] Failed to send feedback email to admin:`, error);
    }
}

/**
 * Reset Password Email Template
 */
async function sendResetPasswordEmail(toEmail, token) {
    // Use production frontend URL, not the backend URL
    const baseUrl = process.env.APP_URL || 'https://swap-pay.vercel.app';
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Always log the link so it can be found in Render logs as a fallback
    logCriticalEmailToConsole("Password Reset Link", toEmail, resetLink);

    let t;
    try {
        t = await getTransporter();
    } catch (err) {
        console.error('[Email Service] Cannot get transporter:', err.message);
        return { success: false, resetLink, error: err.message };
    }

    const mailOptions = {
        from: `"SwapPay" <${senderEmail}>`,
        to: toEmail,
        subject: "🔑 Reset Your SwapPay Password",
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>SwapPay Password Reset</h2>
                <p>Click the link below to reset your password. This link will expire in 15 minutes.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p>If you did not request this, you can safely ignore this email.</p>
                <hr>
                <p style="font-size: 12px; color: #666;">If the button above doesn't work, copy and paste this link into your browser:</p>
                <p style="font-size: 12px; color: #666; word-break: break-all;">${resetLink}</p>
            </div>
        `
    };

    try {
        await sendWithFallback(t, mailOptions);
        console.log(`[Email Service] Password reset email sent to ${toEmail}`);
        return { success: true, resetLink };
    } catch (error) {
        console.error('[Email Service] Failed to send reset email:', error.message);
        return { success: false, resetLink, error: error.message };
    }
}

/**
 * Issue Resolved Email Template
 */
async function sendIssueResolvedEmail(toEmail, userName) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const content = `
        <p>Hi ${userName},</p>
        <p>Your reported issue has been successfully resolved.</p>
        <p>If you still face any problems, feel free to reply to this email.</p>
        <p>– Team SwapPay</p>
    `;

    const mailOptions = {
        from: `"SwapPay Support" <${senderEmail}>`,
        to: toEmail,
        subject: "Your SwapPay Issue is Resolved ✅",
        html: getEmailTemplateWrapper("Issue Resolved", content)
    };

    try {
        await sendWithFallback(t, mailOptions);
        console.log(`Sent Issue Resolved Email to ${toEmail}`);
    } catch (error) {
        console.error(`[CRITICAL] Failed to send issue resolved email to ${toEmail}:`, error);
    }
}

/**
 * Admin Feedback Reply Email Template
 */
async function sendFeedbackReplyEmail(toEmail, userName, replyMessage) {
    if (!(await isEmailNotificationEnabled())) return;
    const t = await getTransporter();

    const content = `
        <p>Hi ${userName},</p>
        <p>An administrator has replied to your feedback/issue:</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${replyMessage}
        </div>
        <p>If you have further questions, feel free to reach out.</p>
        <p>– Team SwapPay</p>
    `;

    const mailOptions = {
        from: `"SwapPay Support" <${senderEmail}>`,
        to: toEmail,
        subject: "New Reply to Your SwapPay Feedback",
        html: getEmailTemplateWrapper("Admin Reply", content)
    };

    try {
        await sendWithFallback(t, mailOptions);
        console.log(`Sent Feedback Reply Email to ${toEmail}`);
    } catch (error) {
        console.error(`[CRITICAL] Failed to send feedback reply email to ${toEmail}:`, error);
    }
}

module.exports = {
    sendSwapCreatedEmail,
    sendSwapMatchedEmail,
    sendPendingConfirmationEmail,
    sendSwapCompletedEmail,
    sendRatingReceivedEmail,
    sendPendingReminderEmail,
    sendPartialMatchEmail,
    sendMultiplePartnersAvailableEmail,
    sendBestMatchFoundEmail,
    sendOTPEmail,
    sendTrustWarningEmail,
    sendContactEmail,
    sendFeedbackEmailToAdmin,
    sendResetPasswordEmail,
    sendIssueResolvedEmail,
    sendFeedbackReplyEmail
};


/**
 * Helper function to send email with Vercel Proxy fallback
 */
async function sendWithFallback(t, mailOptions) {
    try {
        const info = await t.sendMail(mailOptions);
        return info || {};
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET' || error.code === 'ENETUNREACH' || error.code === 'ECONNREFUSED' || (error.message && (error.message.includes('timeout') || error.message.includes('ENETUNREACH') || error.message.includes('ESOCKET')))) {
            console.log('[Email Service] Network issue detected (timeout or unreachable). Falling back to Vercel Proxy...');
            try {
                const response = await fetch('https://swap-pay.vercel.app/api/sendEmailProxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: mailOptions.to,
                        subject: mailOptions.subject,
                        html: mailOptions.html,
                        secret: process.env.PROXY_SECRET,
                        authUser: process.env.EMAIL_USER,
                        authPass: process.env.EMAIL_PASS
                    })
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Proxy returned ${response.status}: ${errText}`);
                }
                const data = await response.json();
                return { messageId: data.messageId, proxy: true };
            } catch (proxyError) {
                console.error('[CRITICAL] Vercel Proxy also failed:', proxyError);
                throw error;
            }
        }
        throw error;
    }
}
