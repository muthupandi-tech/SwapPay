const swapController = require('./controllers/swapController');
const mockReq = { session: { userId: 2 } };
const mockRes = {
  status: (code) => ({
    json: (data) => console.log('API Response:', JSON.stringify(data, null, 2))
  })
};

async function test() {
  await swapController.getActiveSwaps(mockReq, mockRes);
  process.exit();
}
test();
