const { sendContactEmail } = require('../utils/emailService');

exports.sendContactMessage = async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Basic Validation
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Email format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        // Send Email
        await sendContactEmail(name, email, message);

        return res.status(200).json({ message: 'Message sent successfully ✅' });
    } catch (error) {
        console.error('Contact email error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to send message.' });
    }
};
