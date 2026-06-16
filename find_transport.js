const fs = require('fs');
const c = fs.readFileSync('public/fenjing/assets/index-DSxpk27Y.js', 'utf8');

// Find the transports config
const i = c.indexOf('transports:["websocket"]');
if (i > -1) {
  const start = Math.max(0, i - 100);
  const end = Math.min(c.length, i + 50);
  console.log('=== Context ===');
  console.log(c.slice(start, end));
  console.log('\n=== Position ===', i);
} else {
  // Try different patterns
  const patterns = ['transports', 'websocket', 'polling'];
  for (const p of patterns) {
    let idx = 0;
    let count = 0;
    while ((idx = c.indexOf(p, idx + 1)) !== -1 && count < 3) {
      console.log(p, '@', idx, ':', c.slice(Math.max(0, idx - 30), idx + 40));
      count++;
    }
  }
}
