async function testSupport() {
    const baseUrl = 'http://localhost:3000/api/support';
    
    try {
        console.log("Checking if Support API endpoint exists using fetch...");
        // Test unauthorized access (should return 401)
        const res = await fetch(`${baseUrl}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'feedback',
                message: 'Test message',
                rating: 5
            })
        });
        
        if (res.status === 401) {
            console.log("SUCCESS: 401 Unauthorized returned as expected for no session.");
        } else {
            console.log(`UNEXPECTED: Status code ${res.status} returned.`);
        }
        
    } catch (err) {
        console.error("Error connecting to server. Is it running?", err.message);
    }
}

testSupport();
