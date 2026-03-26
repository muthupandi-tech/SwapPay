const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Adjust if necessary

async function testDoubleState() {
  try {
    console.log("--- STARTING DOUBLE STATE TEST ---");

    // 1. Login as User A (Requester)
    console.log("Logging in as User A...");
    const loginA = await axios.post(`${BASE_URL}/api/user/login`, {
      email: 'pandi@gmail.com', // Use existing users from your seed data
      password: '123'
    });
    const cookieA = loginA.headers['set-cookie'];

    // 2. Create a Swap as User A
    console.log("Creating swap as User A...");
    const createRes = await axios.post(`${BASE_URL}/api/swaps/createSwap`, {
      type: 'need_cash',
      amount: 500,
      location: 'Test Library'
    }, { headers: { Cookie: cookieA } });

    const swapId = createRes.data.swapId;
    console.log(`Created swap ID: ${swapId}`);

    // 3. Check Active Swaps for User A
    let activeRes = await axios.get(`${BASE_URL}/api/swaps/active`, { headers: { Cookie: cookieA } });
    console.log(`User A Active Swaps count: ${activeRes.data.swaps.length}`);
    const foundInActiveBefore = activeRes.data.swaps.find(s => s.id === swapId);
    console.log(`Found in active before: ${!!foundInActiveBefore}`);

    // 4. Login as User B (Accepter)
    console.log("Logging in as User B...");
    const loginB = await axios.post(`${BASE_URL}/api/user/login`, {
      email: 'user2@example.com',
      password: 'password123'
    });
    const cookieB = loginB.headers['set-cookie'];

    // 5. Accept Swap as User B
    console.log(`Accepting swap ${swapId} as User B...`);
    await axios.post(`${BASE_URL}/api/swaps/accept`, {
      swapId: swapId
    }, { headers: { Cookie: cookieB } });

    // 6. Check Active Swaps for User A
    activeRes = await axios.get(`${BASE_URL}/api/swaps/active`, { headers: { Cookie: cookieA } });
    console.log(`User A Active Swaps count after acceptance: ${activeRes.data.swaps.length}`);
    const foundInActiveAfter = activeRes.data.swaps.find(s => s.id === swapId);
    console.log(`Found in active after: ${!!foundInActiveAfter}`);

    // 7. Check Matched Swaps for User A
    const matchedRes = await axios.get(`${BASE_URL}/api/swaps/matched`, { headers: { Cookie: cookieA } });
    console.log(`User A Matched Swaps count: ${matchedRes.data.swaps.length}`);
    const foundInMatched = matchedRes.data.swaps.find(s => s.swap_id === swapId || s.match_id === swapId);
    console.log(`Found in matched: ${!!foundInMatched}`);

    if (foundInActiveAfter && foundInMatched) {
      console.error("BUG REPRODUCED: Swap found in both Active and Matched states!");
    } else {
      console.log("Verification complete. Check logic.");
    }

  } catch (err) {
    console.error("Test failed:", err.response ? err.response.data : err.message);
  }
}

testDoubleState();
