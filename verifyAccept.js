const swapController = require('./controllers/swapController');
global.io = { to: () => ({ emit: () => {} }), emit: () => {} };

const mockReq = { 
  session: { userId: 1 },
  body: { swapId: 85 }
};
const mockRes = {
  status: (code) => ({
    json: (data) => console.log('HTTP', code, data)
  }),
  json: (data) => console.log('JSON', data)
};

async function test() {
  await swapController.acceptSwap(mockReq, mockRes);
  process.exit();
}
test();
