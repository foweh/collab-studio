const { Client } = require('ssh2');

const testCode = `
const { io } = require('socket.io-client');
const s1 = io('http://localhost:3000/fenjing');
let stateReceived = false;

s1.on('connect', () => { console.log('S1 CONNECTED:', s1.id); });
s1.on('fenjing:state-sync', (state) => {
  if (!stateReceived) {
    console.log('S1 STATE: ' + state.shots.length + ' shots, ' + state.scenes.length + ' scenes');
    stateReceived = true;
    const newScene = { id: 't' + Date.now(), name: 'TEST_SYNC', order: state.scenes.length };
    state.scenes.push(newScene);
    console.log('S1 EMITTING scenes-update');
    s1.emit('fenjing:scenes-update', state.scenes);
    setTimeout(() => {
      const s2 = io('http://localhost:3000/fenjing');
      s2.on('connect', () => { console.log('S2 CONNECTED'); });
      s2.on('fenjing:scenes-update', (scenes) => {
        console.log('S2 GOT scenes-update, scenes=' + scenes.length + ', last=' + scenes[scenes.length-1].name);
        console.log('SYNC ' + (scenes[scenes.length-1].name === 'TEST_SYNC' ? 'OK' : 'FAILED'));
      });
      s2.on('fenjing:state-sync', (st) => { console.log('S2 STATE: ' + st.scenes.length + ' scenes'); });
      setTimeout(() => { console.log('DONE'); process.exit(0); }, 3000);
    }, 1000);
  }
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
`;

const b64 = Buffer.from(testCode).toString('base64');

const conn = new Client();
conn.on('ready', () => {
  const cmd = 'cd /root/collab-studio/collab-studio && echo ' + JSON.stringify(b64) + ' | base64 -d > _test_fenjing.js && node _test_fenjing.js';

  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', (d) => { out += d; });
    stream.stderr.on('data', (d) => { out += 'E:' + d; });
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
});
conn.on('error', (e) => console.error('Conn error:', e.message));
conn.connect({ host: '8.213.147.43', port: 22, username: 'root', password: 'Abdurahman666%', readyTimeout: 10000 });
