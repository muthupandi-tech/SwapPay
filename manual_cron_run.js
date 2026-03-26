const { checkBestMatches } = require('./services/cronService');

async function manualRun() {
  console.log("Starting manual check for best matches...");
  try {
    await checkBestMatches();
    console.log("Manual check completed.");
  } catch (err) {
    console.error("Error during manual run:", err);
  }
}

manualRun().then(() => process.exit(0));
