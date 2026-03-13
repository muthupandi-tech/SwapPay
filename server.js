require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const http = require('http'); // Add HTTP module
const { Server } = require('socket.io'); // Add Socket.IO

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Make io globally accessible
global.io = io;

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log('A user connected via WebSocket:', socket.id);

    // Private Room Join
    socket.on('join', (userId) => {
        if (userId) {
            socket.join(`user_${userId}`);
            console.log(`Socket ${socket.id} joined private room user_${userId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
const PORT = process.env.PORT || 3000;


// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure express-session
app.use(session({
    secret: 'swappay_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 1000 * 60 * 60 * 24 // 1 day session
    }
}));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Use the auth routes for API calls
app.use('/api/auth', authRoutes);

// Use the swap routes for API calls
const swapRoutes = require('./routes/swapRoutes');
app.use('/api/swaps', swapRoutes);

// Use the admin routes for API calls
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/notifications', notificationRoutes);
app.use('/api/user', userRoutes);

const requireAdminAPI = (req, res, next) => {
    if (req.session && req.session.userId && req.session.role === 'admin') {
        return next();
    } else {
        return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }
};
app.use('/api/admin', requireAdminAPI, adminRoutes);

// Database connection simulation (configure with your credentials)
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.redirect('/login');
    }
};

// Routes to serve the HTML pages
app.get('/', (req, res) => {
    // If logged in, redirect to dashboard
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

// Protected Route for Dashboard
app.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Protected Route for Profile
app.get('/profile', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

// Protected Route for Admin Dashboard
app.get('/admin', requireLogin, (req, res) => {
    if (req.session.role !== 'admin') {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);

    // Initialize Smart Automated Email Notification System
    const { startCronService } = require('./services/cronService');
    startCronService();
});
