const swapController = require('./controllers/swapController');

async function testControllers() {
    const req = { session: { userId: 17 } };
    
    console.log("Testing getDashboardStats...");
    let resStats = {
        status: (code) => ({ json: (data) => console.log('Stats:', code) }),
        json: (data) => console.log('Stats 200')
    };
    await swapController.getDashboardStats(req, resStats);

    console.log("Testing getMySwaps...");
    let resMySwaps = {
        status: (code) => ({ json: (data) => console.log('MySwaps:', code) }),
        json: (data) => console.log('MySwaps 200')
    };
    await swapController.getMySwaps(req, resMySwaps);

    console.log("Testing getOpenSwaps...");
    let resOpenSwaps = {
        status: (code) => ({ json: (data) => console.log('Open:', code) }),
        json: (data) => console.log('Open 200')
    };
    await swapController.getOpenSwaps(req, resOpenSwaps);

    console.log("All done.");
}

testControllers().catch(console.error);
