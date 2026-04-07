const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const emailService = require('../utils/emailService');
const pool = require('../config/db');

exports.registerUser = async (req, res) => {
    const { name, phone, email, college, password, confirmPassword } = req.body;

    if (!name || !phone || !email || !college || !password || !confirmPassword) {
        return res.status(400).send('All fields are required.');
    }

    if (password !== confirmPassword) {
        return res.status(400).send('Passwords do not match.');
    }

    try {
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // 5 minutes expiry
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

        // Store user in MySQL database
        const query = 'INSERT INTO users (name, phone, email, college, password, is_verified, otp_code, otp_expiry) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?)';
        const [result] = await pool.execute(query, [name, phone, email, college, hashedPassword, otp, otpExpiry]);

        // Send OTP Email
        await emailService.sendOTPEmail(email, otp);

        return res.status(201).json({ 
            success: true, 
            message: 'OTP sent to your email.', 
            redirect: `/verify-otp?email=${encodeURIComponent(email)}` 
        });
    } catch (error) {
        console.error('Registration Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).send('Email is already registered.');
        }
        return res.status(500).send('An error occurred during registration.');
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email and password are required.');
    }

    try {
        const [rows] = await pool.execute('SELECT id, name, email, password, role, is_verified, is_blocked FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).send('Invalid email or password.');
        }

        const user = rows[0];

        if (!user.is_verified) {
            return res.status(401).send(`Please verify your email first.<br><br><a href="/verify-otp?email=${encodeURIComponent(email)}">Click here to verify</a>`);
        }

        if (user.is_blocked) {
            return res.status(403).send('Your account has been blocked by an administrator.');
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).send('Invalid email or password.');
        }

        // Create session
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.role = user.role; // Store role for admin checks

        req.session.role = user.role;

        return res.json({ 
            success: true, 
            message: 'Login successful!', 
            redirect: user.role === 'admin' ? '/admin-dashboard' : '/dashboard' 
        });

    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).send('An error occurred during login.');
    }
};

exports.logoutUser = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect('/');
    });
};

exports.getCurrentUser = async (req, res) => {
    if (req.session && req.session.userId) {
        try {
            const mysql = require('mysql2/promise');
            const pool = mysql.createPool({
                host: 'localhost',
                user: 'root',
                password: 'mysqlpandi',
                database: 'swappay',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
            const [rows] = await pool.execute('SELECT campus_name, block_name, auto_match FROM users WHERE id = ?', [req.session.userId]);
            pool.end();

            let campus_name = null;
            let block_name = null;

            if (rows.length > 0) {
                campus_name = rows[0].campus_name;
                block_name = rows[0].block_name;
                auto_match = rows[0].auto_match;
            }

            return res.json({
                id: req.session.userId,
                name: req.session.userName,
                role: req.session.role,
                campus_name,
                block_name,
                auto_match
            });
        } catch (err) {
            console.error('Error fetching current user location:', err);
            // Fallback
            return res.json({ id: req.session.userId, name: req.session.userName, role: req.session.role, campus_name: null, block_name: null });
        }
    } else {
        return res.status(401).json({ error: 'Not authenticated' });
    }
};

exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    try {
        const [rows] = await pool.execute('SELECT id, otp_code, otp_expiry, is_verified FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'User not found.' });
        }

        const user = rows[0];
        if (user.is_verified) {
            return res.status(400).json({ success: false, message: 'Account is already verified.' });
        }

        if (user.otp_code !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP.' });
        }

        const now = new Date();
        if (new Date(user.otp_expiry) < now) {
            return res.status(400).json({ success: false, message: 'OTP has expired.' });
        }

        // Verify user and clear OTP
        await pool.execute('UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expiry = NULL WHERE id = ?', [user.id]);

        return res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        return res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
};

exports.resendOTP = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    try {
        const [rows] = await pool.execute('SELECT id, is_verified FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'User not found.' });
        }

        if (rows[0].is_verified) {
            return res.status(400).json({ success: false, message: 'Account is already verified.' });
        }

        // Generate new 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // 5 minutes expiry
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

        await pool.execute('UPDATE users SET otp_code = ?, otp_expiry = ? WHERE id = ?', [otp, otpExpiry, rows[0].id]);

        // Send OTP Email
        await emailService.sendOTPEmail(email, otp);

        return res.json({ success: true, message: 'A new OTP has been sent to your email.' });
    } catch (error) {
        console.error('Resend OTP Error:', error);
        return res.status(500).json({ success: false, message: 'An unexpected error occurred. Please try again later.' });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    try {
        const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            // For security, don't reveal if email exists or not
            return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await pool.execute(
            'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
            [token, expiry, rows[0].id]
        );

        await emailService.sendResetPasswordEmail(email, token);

        return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        return res.status(500).json({ success: false, message: 'An unexpected error occurred. Please try again later.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    try {
        const [rows] = await pool.execute(
            'SELECT id, reset_token_expiry FROM users WHERE reset_token = ?',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
        }

        const user = rows[0];
        if (new Date(user.reset_token_expiry) < new Date()) {
            return res.status(400).json({ success: false, message: 'Reset token has expired.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        return res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        return res.status(500).json({ success: false, message: 'An unexpected error occurred. Please try again later.' });
    }
};
