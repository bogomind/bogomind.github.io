// Publish this directory to Surge using the account in ~/.netrc.
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const domain = fs.readFileSync(path.join(__dirname, '..', 'CNAME'), 'utf8').trim();
const netrc = fs.readFileSync(path.join(os.homedir(), '.netrc'), 'utf8');
const block = netrc.split(/\n\s*\n/).find(b => b.includes('machine surge.surge.sh'));
const user = block.match(/login\s+(\S+)/)[1];
const pass = block.match(/password\s+(\S+)/)[1];

const p = spawn('npx', ['--yes', 'surge', './', domain], {cwd: path.join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe']});
let out = '', sentE = false, sentP = false;
const onData = d => {
  process.stdout.write(d);
  out += d;
  if (!sentE && /email:/.test(out)) { sentE = true; setTimeout(() => p.stdin.write(user + '\r'), 400); }
  if (!sentP && /password:/.test(out)) { sentP = true; setTimeout(() => p.stdin.write(pass + '\r'), 400); }
};
p.stdout.on('data', onData);
p.stderr.on('data', onData);
p.on('exit', c => { console.log(`\n[exit ${c}]`); process.exit(c); });
setTimeout(() => { console.log('\n[timeout]'); p.kill(); }, 180000);
