import assert from 'node:assert/strict';
import test from 'node:test';
const { createSessionController } = await import('./session-controller.ts').catch(() => ({}));
const actor = { id: 1, name: 'Admin', email: 'admin@example.com', permissions: ['super-user'] };
const target = { id: 2, name: 'Employee', email: 'employee@example.com', permissions: ['products-index'] };
const impersonation = { id: 3, actor, target };
const unauthorized = () => Object.assign(new Error('Unauthenticated'), { status: 401 });
function setup(initial = { token: 'original' }) {
  let saved = initial;
  const calls = [];
  const api = {
    me: async token => { calls.push(['me', token]); return { data: token === 'child' ? { ...target, impersonation } : actor }; },
    login: async () => ({ data: { token: 'original', user: actor } }),
    start: async (id, branch, token) => { calls.push(['start', id, branch, token]); return { data: { token: 'child', user: target, impersonation } }; },
    stop: async (id, token) => { calls.push(['stop', id, token]); },
    logout: async token => { calls.push(['logout', token]); },
  };
  const storage = { read: async () => saved, write: async value => { saved = value; } };
  let state;
  const controller = createSessionController({ api, storage, onChange: value => { state = value; }, navigate: route => calls.push(['navigate', route]) });
  return { controller, api, storage, calls, saved: () => saved, state: () => state };
}

test('switches identity with target permissions and saves an atomic return session', async () => {
  const s = setup();
  await s.controller.bootstrap();
  assert.equal(await s.controller.startImpersonation(2), null);
  assert.deepEqual(s.saved(), { token: 'child', originalToken: 'original', impersonation });
  assert.deepEqual(s.state().user, target);
  assert.equal(s.state().impersonation.id, 3);
  assert.deepEqual(s.calls.at(-1), ['navigate', 'dashboard']);
});
test('branch selection leaves the original login intact until selected', async () => {
  const s = setup();
  s.api.start = async () => ({ data: { requires_branch: true, branches: [{ id: 8, name: 'Branch' }] } });
  await s.controller.bootstrap();
  assert.deepEqual(await s.controller.startImpersonation(2), [{ id: 8, name: 'Branch' }]);
  assert.deepEqual(s.saved(), { token: 'original' });
  assert.equal(s.state().user.id, 1);
});
test('stop authenticates with original token and restores its fresh permissions', async () => {
  const s = setup({ token: 'child', originalToken: 'original', impersonation });
  await s.controller.bootstrap();
  await s.controller.stopImpersonation();
  assert.ok(s.calls.some(c => c[0] === 'stop' && c[1] === 3 && c[2] === 'original'));
  assert.deepEqual(s.saved(), { token: 'original' });
  assert.equal(s.state().user.id, 1);
  assert.equal(s.state().impersonation, null);
});
test('reload restores impersonation metadata and a usable return action', async () => {
  const s = setup({ token: 'child', originalToken: 'original', impersonation });
  await s.controller.bootstrap();
  assert.equal(s.state().user.id, 2);
  assert.equal(s.state().impersonation.id, 3);
  assert.equal(s.state().loading, false);
});
test('disabled target recovers original account on bootstrap', async () => {
  const s = setup({ token: 'child', originalToken: 'original', impersonation });
  s.api.me = async token => { if (token === 'child') throw unauthorized(); return { data: actor }; };
  await s.controller.bootstrap();
  assert.equal(s.state().user.id, 1);
  assert.deepEqual(s.saved(), { token: 'original' });
});
test('invalid original token clears credentials and returns to login', async () => {
  const s = setup({ token: 'child', originalToken: 'original', impersonation });
  s.api.stop = async () => { throw unauthorized(); };
  await s.controller.stopImpersonation();
  assert.equal(s.saved(), null);
  assert.equal(s.state().user, null);
  assert.deepEqual(s.calls.at(-1), ['navigate', 'login']);
});
test('network failure while stopping retains recovery credentials', async () => {
  const initial = { token: 'child', originalToken: 'original', impersonation };
  const s = setup(initial);
  s.api.stop = async () => { throw new Error('Offline'); };
  await assert.rejects(s.controller.stopImpersonation(), /Offline/);
  assert.deepEqual(s.saved(), initial);
  assert.equal(s.state().sessionBusy, false);
});
test('network failure on bootstrap retains banner and recovery credentials', async () => {
  const initial = { token: 'child', originalToken: 'original', impersonation };
  const s = setup(initial);
  s.api.me = async () => { throw new Error('Offline'); };
  await s.controller.bootstrap();
  assert.deepEqual(s.saved(), initial);
  assert.equal(s.state().impersonation.id, 3);
});
test('rejects nested impersonation without making a request', async () => {
  const s = setup({ token: 'child', originalToken: 'original', impersonation });
  await s.controller.bootstrap();
  await assert.rejects(s.controller.startImpersonation(4), /already impersonating/i);
  assert.equal(s.calls.filter(c => c[0] === 'start').length, 0);
});
test('failed start retains the original session', async () => {
  const s = setup();
  s.api.start = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
  await assert.rejects(s.controller.startImpersonation(2), /Forbidden/);
  assert.deepEqual(s.saved(), { token: 'original' });
});
test('concurrent submissions issue only one start request', async () => {
  const s = setup();
  let finish;
  s.api.start = () => new Promise(resolve => { finish = resolve; });
  const first = s.controller.startImpersonation(2);
  await assert.rejects(s.controller.startImpersonation(2), /in progress/i);
  await new Promise(resolve => setTimeout(resolve, 0));
  finish({ data: { token: 'child', user: target, impersonation } });
  await first;
});
test('logout ends temporary session then logs out original account', async () => {
  const s = setup({ token: 'child', originalToken: 'original', impersonation });
  await s.controller.logout();
  assert.deepEqual(s.calls.filter(c => ['stop', 'logout'].includes(c[0])), [['stop', 3, 'original'], ['logout', 'original']]);
  assert.equal(s.saved(), null);
});
test('logout offline preserves impersonation recovery', async () => {
  const initial = { token: 'child', originalToken: 'original', impersonation };
  const s = setup(initial);
  s.api.stop = async () => { throw new Error('Offline'); };
  await assert.rejects(s.controller.logout(), /Offline/);
  assert.deepEqual(s.saved(), initial);
});
test('storage failure after token issuance revokes child and leaves original login', async () => {
  const s = setup();
  s.storage.write = async () => { throw new Error('Storage full'); };
  await assert.rejects(s.controller.startImpersonation(2), /Storage full/);
  assert.ok(s.calls.some(c => c[0] === 'stop'));
  assert.deepEqual(s.saved(), { token: 'original' });
});
test('stale me response cannot replace a newer session', async () => {
  const s = setup();
  let finish;
  s.api.me = () => new Promise(resolve => { finish = resolve; });
  const pending = s.controller.bootstrap();
  await new Promise(resolve => setTimeout(resolve, 0));
  await s.controller.startImpersonation(2);
  finish({ data: actor });
  await pending;
  assert.equal(s.state().user.id, 2);
});

test('refresh begun during a switch cannot restore the previous identity', async () => {
  const s = setup();
  let finishStart, finishMe;
  s.api.start = () => new Promise(resolve => { finishStart = resolve; });
  s.api.me = () => new Promise(resolve => { finishMe = resolve; });
  const pendingStart = s.controller.startImpersonation(2);
  await new Promise(resolve => setTimeout(resolve, 0));
  const pendingRefresh = s.controller.refreshUser();
  await new Promise(resolve => setTimeout(resolve, 0));
  finishStart({ data: { token: 'child', user: target, impersonation } });
  await pendingStart;
  finishMe({ data: actor });
  await pendingRefresh;
  assert.equal(s.state().user.id, 2);
});
