const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    const cookie = res.headers['set-cookie'] ? res.headers['set-cookie'][0] : '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Login Response:', data);
        console.log('Cookie:', cookie);

        if (cookie) {
            const getOptions = {
                hostname: 'localhost',
                port: 3000,
                path: '/api/swaps/open',
                method: 'GET',
                headers: {
                    'Cookie': cookie
                }
            };

            const getReq = http.request(getOptions, (getRes) => {
                let getData = '';
                getRes.on('data', (chunk) => { getData += chunk; });
                getRes.on('end', () => {
                    console.log('Open Swaps Code:', getRes.statusCode);
                    console.log('Open Swaps Response:', getData);
                });
            });
            getReq.end();

            const statsOptions = {
                hostname: 'localhost',
                port: 3000,
                path: '/api/user/dashboard-stats',
                method: 'GET',
                headers: {
                    'Cookie': cookie
                }
            };

            const statsReq = http.request(statsOptions, (statsRes) => {
                let statsData = '';
                statsRes.on('data', (chunk) => { statsData += chunk; });
                statsRes.on('end', () => {
                    console.log('Stats Code:', statsRes.statusCode);
                    console.log('Stats Response:', statsData);
                });
            });
            statsReq.end();
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(JSON.stringify({
    email: 'mp966291@gmail.com',
    password: 'muthu'
}));
req.end();
