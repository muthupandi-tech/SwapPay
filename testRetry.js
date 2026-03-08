const { sendSwapMatchedEmail } = require('./utils/emailService');

// Setup mock global.io to catch the emit
let emittedEvent = null;
global.io = {
    emit: (event, data) => {
        emittedEvent = { event, data };
        console.log(`[Mock Socket Emit] ${event}:`, data);
    }
};

// Force email configuration to be broken locally
process.env.EMAIL_USER = 'broken_email@gmail.com';
process.env.EMAIL_PASS = 'wrong_password';

async function test() {
    console.log("Starting retry test...");
    await sendSwapMatchedEmail(
        'test@example.com',
        'Alice User',
        'Bob Partner',
        'bob@test.com',
        'Need Cash',
        500,
        'Campus Library'
    );
    console.log("Test finished.");
    process.exit(0);
}

test();
