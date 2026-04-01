const swapController = require('./controllers/swapController');
require('dotenv').config();

const req = {
  session: { userId: 1 },
  user: { id: 1 },
  query: {}
};

const res = {
  status: function(s) { 
    console.log('Status:', s); 
    return this; 
  },
  json: function(j) {
    console.log('JSON Length:', j.swaps ? j.swaps.length : "undefined");
    if(j.error) console.error('Error JSON:', j);
  }
};

async function test() {
  console.log("Testing getActiveSwaps:");
  await swapController.getActiveSwaps(req, res);
  console.log("Testing getSwapFeed:");
  await swapController.getSwapFeed(req, res);
}
test().catch(console.error);
