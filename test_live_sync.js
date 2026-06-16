const { Client } = require('ssh2');

const testCode = `
const { io } = require('socket.io-client');
const s1 = io('http://localhost:3000/fenjing');
const s2 = io('http://localhost:3000/fenjing');

let s1Ready = false;
let s2Ready = false;

s1.on('connect', () => { console.log('S1 CONNECTED'); });
s1.on('fenjing:scenes-update', (scenes) => { console.log('S1 scenes-update: ' + scenes.length); });
s1.on('fenjing:state-sync', (state) => {
  if (!s1Ready) {
    s1Ready = true;
    console.log('S1 STATE: ' + state.shots.length + ' shots');
  }
});

s2.on('connect', () => { console.log('S2 CONNECTED'); });
s2.on('fenjing:scenes-update', (scenes) => { console.log('S2 GOT scenes-update: ' + scenes.length + ' scenes'); });
s2.on('fenjing:shots-update', (shots) => { console.log('S2 GOT shots-update: ' + shots.length + ' shots'); });
s2.on('fenjing:state-sync', (st) => {
  if (!s2Ready) {
    s2Ready = true;
    console.log('S2 STATE: ' + st.scenes.length + ' scenes');
    // Both ready, now test sync
    setTimeout(() => {
      console.log('\\n--- TEST: S1 adds a scene ---');
      const newScene = { id: 't' + Date.now(), name: 'LIVE_SYNC_TEST', order: st.scenes.length };
      st.scenes.push(newScene);
      s1.emit('fenjing:scenes-update', st.scenes);
      console.log('S1 EMITTED scenes-update');
      
      setTimeout(() => {
        console.log('\\n--- RESULT ---');
        console.log('S2 scenes-update events logged above show if sync works');
        console.log('DONE');
        process.exit(0);
      }, 2000);
    }, 1500);
  }
});

setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
`;

const b64 = Buffer.from(testCode).toString('base64');

const conn = new Client();
conn.on('ready', () => {
  const cmd = 'cd /root/collab-studio/collab-studio && echo ' + JSON.stringify(b64) + ' | base64 -d > _test_live.js && node _test_live.js';

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
