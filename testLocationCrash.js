const http = require('http');
async function doRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function run() {
    try {
        const loginData = 'email=alonergowtha%40gmail.com&password=password123';
        const loginRes = await doRequest({
            hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': loginData.length }
        }, loginData);
        
        const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : null;
        if (!cookie) return console.log('Login fail');
        
        console.log('Testing location PUT...');
        const payload = JSON.stringify({ lat: 10.957, lng: 77.955 });
        const r1 = await doRequest({ 
            hostname: 'localhost', port: 3000, path: '/api/user/location', method: 'PUT', 
            headers: { 'Cookie': cookie, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, payload);
        
        console.log('Location PUT:', r1.status, r1.body);
    } catch(e) { console.error('Error:', e); }
}
run();
