const rateLimit = require('express-rate-limit');

// General rate limiter for sensitive auth routes
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests. Please wait a few minutes before trying again.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = {
    authLimiter
};
