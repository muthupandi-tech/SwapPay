const http = require('http');

http.get('http://localhost:3000/api/swaps/active', (res) => {
  console.log('Status code:', res.statusCode);
  res.on('data', d => console.log('Data:', d.toString()));
}).on('error', (e) => {
  console.error('Server is down or unreachable:', e);
});
