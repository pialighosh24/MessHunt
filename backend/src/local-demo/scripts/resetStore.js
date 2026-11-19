require('dotenv').config();

const readline = require('readline');
const { initStore, resetStore, backupStore } = require('../store');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function main() {
  if (String(process.env.APP_MODE || '').trim().toLowerCase() !== 'local-demo') {
    console.error('Refusing to run: APP_MODE must be "local-demo" for local demo store reset.');
    process.exit(1);
  }

  const confirmedFlag = process.argv.includes('--confirm');
  if (!confirmedFlag) {
    console.error('Refusing to reset without explicit confirmation.');
    console.error('Usage: node src/local-demo/scripts/resetStore.js --confirm');
    process.exit(1);
  }

  const answer = await ask('This will remove ALL local demo data (accounts, listings, reviews, favourites). Type RESET to continue: ');
  if (answer !== 'RESET') {
    console.log('Reset cancelled.');
    process.exit(0);
  }

  await initStore();
  const backupPath = await backupStore('manual-reset');
  await resetStore({ backup: false }); // already backed up
  console.log('Local demo store reset successfully.');
  console.log(`Backup created at: ${backupPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to reset local demo store:', err.message);
  process.exit(1);
});
