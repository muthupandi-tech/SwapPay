const pool = require('./config/db');
const swapController = require('./controllers/swapController');

async function testMatched() {
    const req = {
        user: { id: 3 }, // User B
        body: {},
        session: { userId: 3 }
    };
    const res = {
        status: function(s) {
            this.statusCode = s;
            return this;
        },
        json: function(data) {
            console.log("Status:", this.statusCode);
            console.log("Data:", JSON.stringify(data, null, 2));
        }
    };

    await swapController.getMatchedSwaps(req, res);
    pool.end();
}

testMatched();
