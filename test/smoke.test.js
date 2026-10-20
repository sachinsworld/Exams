const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

 test('native API supports first-admin setup, authenticated storage and static assets', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'granth-smoke-'));
  const port = 32000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), DATA_DIR: dir, SESSION_SECRET: 'test-session-secret' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  t.after(() => { child.kill('SIGTERM'); fs.rmSync(dir, { recursive: true, force: true }); });
  let ready = false;
  for (let i = 0; i < 60; i++) {
   try { const r = await fetch(base + '/healthz'); if (r.ok) { ready = true; break; } } catch {}
   await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(ready, true, 'server should start');
  const headers = { 'content-type': 'application/json', 'x-requested-with': 'granth' };
  let r = await fetch(base + '/api/state');
  assert.equal((await r.json()).setup, true);
  r = await fetch(base + '/api/setup', { method: 'POST', headers, body: JSON.stringify({ name: 'Test Admin', email: 'admin@example.test', password: 'safe-password-123' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  r = await fetch(base + '/api/me', { headers: { cookie } });
  const me = (await r.json()).user;
  assert.equal(me.role, 'admin');
  r = await fetch(base + '/api/doc?path=config%2Fmain', { method: 'PUT', headers: { ...headers, cookie }, body: JSON.stringify({ data: { site: { name: 'Granth Academic' } } }) });
  assert.equal(r.status, 200);
  r = await fetch(base + '/api/doc?path=config%2Fmain', { headers: { cookie } });
  assert.equal((await r.json()).data.site.name, 'Granth Academic');
  r = await fetch(base + '/css/app.css'); assert.equal(r.status, 200); assert.match(await r.text(), /premium exam-preparation workspace/);
  r = await fetch(base + '/js/app.js'); assert.equal(r.status, 200); assert.match(await r.text(), /GranthRuntime/);
 });
