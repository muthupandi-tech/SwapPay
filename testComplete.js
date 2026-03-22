const http = require('http');

const data = JSON.stringify({ userId: 2 });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/swaps/completeSwap/82',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
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
