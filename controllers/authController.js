const mysql = require('mysql2');
const bcrypt = require('bcrypt');

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

        // Store user in MySQL database
        const query = 'INSERT INTO users (name, phone, email, college, password) VALUES (?, ?, ?, ?, ?)';
        const [result] = await promisePool.execute(query, [name, phone, email, college, hashedPassword]);

        // Automatically log the user in after successful registration
        req.session.userId = result.insertId;
        req.session.userName = name;

        return res.redirect('/dashboard');
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
        const [rows] = await promisePool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).send('Invalid email or password.');
        }

        const user = rows[0];

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

        // Redirect user
        if (user.role === 'admin') {
            return res.redirect('/admin');
        } else {
            return res.redirect('/dashboard');
        }
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
