const http = require('http');

const loginData = JSON.stringify({ email: 'alonergowtha@gmail.com', password123: 'password' });

const loginReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
    }
}, (loginRes) => {
    console.log('Login Status:', loginRes.statusCode);
    const cookie = loginRes.headers['set-cookie'];
    if (!cookie) {
        console.error("Login failed, no cookie");
        return;
    }

    const locData = JSON.stringify({ lat: 10.957, lng: 77.955 });
    const locReq = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/user/location',
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': locData.length,
            'Cookie': cookie
        }
    }, (locRes) => {
        console.log('Location Status:', locRes.statusCode);
        locRes.on('data', d => process.stdout.write(d));
    });
    
    locReq.on('error', console.error);
    locReq.write(locData);
    locReq.end();
});

loginReq.on('error', console.error);
loginReq.write(loginData);
loginReq.end();
