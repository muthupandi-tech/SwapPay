const nodemailer = require('nodemailer');

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { to, subject, html, secret, authUser, authPass } = req.body;

    // Optional: Add a simple secret token check to prevent unauthorized use of your proxy
    // If you add PROXY_SECRET to your Vercel Environment Variables, it will check it.
    if (process.env.PROXY_SECRET && secret !== process.env.PROXY_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!to || !subject || !html) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Initialize Nodemailer exactly as it was in your backend
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: authUser || process.env.EMAIL_USER,
                pass: authPass || process.env.EMAIL_PASS
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });

        // Verify connection config
        await transporter.verify();

        // Send the email
        const info = await transporter.sendMail({
            from: `"SwapPay Notifications" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });

        return res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Proxy Email Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
