const swapController = require('./controllers/swapController');
const fs = require('fs');
global.io = { to: () => ({ emit: () => {} }), emit: () => {} };

const mockReq = {
  session: { userId: 2 },
  body: {
    type: 'need_upi',
    amount: 15,
    location: 'BH I - room 47',
    allowPartialMatch: true,
    autoAcceptPerfect: true
  }
};

const mockRes = {
  status: (code) => ({
    json: (data) => console.log('HTTP', code, data)
  })
};

const _originalError = console.error;
console.error = function(...args) {
    fs.writeFileSync('cleanError.txt', JSON.stringify(args, null, 2), 'utf8');
}

async function test() {
  await swapController.createSwap(mockReq, mockRes);
  process.exit();
}
test();
