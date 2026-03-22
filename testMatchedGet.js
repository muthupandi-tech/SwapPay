const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/swaps/matched',
  method: 'GET',
  headers: {
    // Inject the cookie session natively mapping User 2
    'Cookie': 'connect.sid=s%3AGjoh63KO7T-u1jz5yAYTARbYT61UcmyO.oXGOHF7%2FvlpaEos0iXJO4ijF5oIDRJ%2ByX8S6ODTFUbA'
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
req.end();
