// 模拟 server.js 最开头的参数解析
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--data-dir' && args[i+1]) {
    process.env.DATA_DIR = args[i+1];
    i++;
  }
}
console.log('env DATA_DIR:', process.env.DATA_DIR);
console.log('env DATA_DIR truthy:', !!process.env.DATA_DIR);
const p = require('../utils/persist');
console.log('DATA_DIR:', p.DATA_DIR);
