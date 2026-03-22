const http = require('http');

const data = JSON.stringify({
  userId: 2,
  type: 'need_upi',
  amount: 15,
  location: 'BH I - room 47',
  allowPartialMatch: true,
  autoAcceptPerfect: true
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/swaps/createSwap',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Cookie': 'connect.sid=s%3A_zI7M_b6C2aWn3h39s' // mock cookie, we use userId natively inside the payload to bypass Auth
  }
};

const req = http.request(options, res => {
  console.log(`Status Code: ${res.statusCode}`);
  let responseData = '';
  res.on('data', chunk => {
    responseData += chunk;
  });
  res.on('end', () => {
    console.log('Response:', responseData);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
