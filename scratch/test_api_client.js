const http = require('http');

// Helper to perform HTTP Requests
function httpRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data ? JSON.parse(data) : null
                });
            });
        });
        req.on('error', (err) => reject(err));
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Client Date Formatting logic to test
function getCorrectedDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date();
    return d;
}

function formatISTDate(dateStr) {
    if (!dateStr) return '';
    const d = getCorrectedDate(dateStr);
    const formatOpts = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: 'Asia/Kolkata' };
    return d.toLocaleString("en-IN", formatOpts);
}

function formatRelativeDate(dateStr, mockNow = null) {
    const date = getCorrectedDate(dateStr);
    const now = mockNow || new Date();
    const diffMs = now - date;
    
    if (diffMs < 0) return 'Just now';
    
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    return formatISTDate(dateStr);
}

(async () => {
    try {
        console.log('--- STARTING INTEGRATION & DATE FORMATTING TESTS ---');
        
        // 1. Log in
        console.log('Logging in user...');
        const loginRes = await httpRequest('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { email: 'mp966291@gmail.com', password: '123456' });

        console.log('Login Response Status:', loginRes.statusCode);
        const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : null;
        if (!cookie) {
            console.error('Failed to get session cookie.');
            return;
        }
        console.log('Session Cookie acquired successfully.');

        // 2. Fetch Nearby Swaps
        console.log('\nFetching Nearby/Available Swaps...');
        const nearbyRes = await httpRequest('http://localhost:3000/api/swaps/nearby', {
            method: 'GET',
            headers: { 'Cookie': cookie }
        });
        
        const nearbySwaps = nearbyRes.body?.swaps || [];
        console.log(`Fetched ${nearbySwaps.length} nearby swaps.`);
        
        // 3. Fetch Swap Feed
        console.log('\nFetching Swap Feed...');
        const feedRes = await httpRequest('http://localhost:3000/api/swaps/feed', {
            method: 'GET',
            headers: { 'Cookie': cookie }
        });
        const feedSwaps = feedRes.body?.swaps || [];
        console.log(`Fetched ${feedSwaps.length} swap feed items.`);

        // 4. Fetch Active/My Swaps
        console.log('\nFetching Active/My Swaps...');
        const activeRes = await httpRequest('http://localhost:3000/api/swaps/active', {
            method: 'GET',
            headers: { 'Cookie': cookie }
        });
        const activeSwaps = activeRes.body?.swaps || [];
        console.log(`Fetched ${activeSwaps.length} active/my swaps.`);

        // 5. Run Verification on date formatting
        console.log('\n--- VERIFICATION OF DATE LOGIC ---');
        
        const testCases = [
            { name: 'Just Now', ageMs: 15 * 1000, expectedRelative: 'Just now' },
            { name: '2 minutes ago', ageMs: 2 * 60 * 1000, expectedRelative: '2 mins ago' },
            { name: '1 hour ago', ageMs: 60 * 60 * 1000, expectedRelative: '1 hour ago' },
            { name: '5 hours ago', ageMs: 5 * 60 * 60 * 1000, expectedRelative: '5 hours ago' },
            { name: 'After 24 hours (Fallback to Created Time)', ageMs: 25 * 60 * 60 * 1000, expectedRelative: 'exact IST time' }
        ];

        const baseTime = new Date('2026-05-22T14:12:28+05:30'); // fixed time
        console.log(`Mocking current time as: ${baseTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

        testCases.forEach((tc) => {
            const createdTime = new Date(baseTime.getTime() - tc.ageMs);
            const createdTimeISO = createdTime.toISOString();
            
            const relOut = formatRelativeDate(createdTimeISO, baseTime);
            const istOut = formatISTDate(createdTimeISO);
            
            console.log(`\nTest Case: ${tc.name}`);
            console.log(`- Created (UTC): ${createdTimeISO}`);
            console.log(`- Created (IST): ${istOut}`);
            console.log(`- Relative Out:  "${relOut}"`);
            
            if (tc.expectedRelative === 'exact IST time') {
                if (relOut === istOut) {
                    console.log('=> SUCCESS (Relative fallback to exact time matches IST output)');
                } else {
                    console.error(`=> FAIL: Expected relative fallback "${istOut}" but got "${relOut}"`);
                }
            } else {
                if (relOut === tc.expectedRelative) {
                    console.log('=> SUCCESS (Relative matches expected)');
                } else {
                    console.error(`=> FAIL: Expected "${tc.expectedRelative}" but got "${relOut}"`);
                }
            }
        });

    } catch (err) {
        console.error('Error during API client tests:', err);
    }
})();
