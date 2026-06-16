const fs=require('fs'),zlib=require('zlib');

const files=[
  'utils/persist.js','utils/ratelimit.js',
  'services/auth.js','services/project.js','services/logger.js','services/annotation.js',
  'public/shared.js','public/i18n.js','public/script-editor.js','public/story-editor.js','public/devices.js',
  'public/login.html','public/default-avatar.png',
  'public/fenjing/index.html','public/fenjing/assets/index-DSxpk27Y.js','public/fenjing/assets/index-XptjBxIK.css'
];

let js='// fix.js - 缺失文件修复\n';
js+='const{execSync}=require("child_process"),fs=require("fs"),path=require("path");\n';
js+='const DST="/root/collab-studio/collab-studio";\n';
js+='const files=[\n';
files.forEach(f=>{
  const buf=fs.readFileSync(f);
  const b64=buf.toString('base64');
  js+='  {p:'+JSON.stringify(f)+',d:'+JSON.stringify(b64)+'},\n';
});
js+='];\n';
js+='files.forEach(f=>{const fp=path.join(DST,f.p);fs.mkdirSync(path.dirname(fp),{recursive:true});fs.writeFileSync(fp,Buffer.from(f.d,"base64"));console.log("OK "+f.p)});\n';
js+='console.log("All files written. Restarting...");\n';
js+='execSync("pkill -f \\"node server.js\\" 2>/dev/null; sleep 1",{cwd:DST});\n';
// Use the shell to set env var and start
js+='const{spawn}=require("child_process");\n';
js+='const p=spawn("nohup",["node","server.js"],{cwd:DST,env:{...process.env,ADMIN_PASSWORD:"Abdurahman666%"},detached:true,stdio:"ignore"});\n';
js+='p.unref();\n';
js+='setTimeout(()=>{try{console.log(execSync("curl -s localhost:3000",{cwd:DST}).toString().slice(0,500))}catch(e){console.log("Check server.log")}},2000);\n';

const gz=zlib.gzipSync(Buffer.from(js));
const b64=gz.toString('base64');
const cmd='echo '+JSON.stringify(b64)+' | base64 -d | gunzip > /root/collab-studio/collab-studio/fix.js && node /root/collab-studio/collab-studio/fix.js';

fs.writeFileSync('fix_node_cmd.txt',cmd,'utf8');
console.log('Size:',(b64.length/1024).toFixed(1),'KB -> fix_node_cmd.txt');
