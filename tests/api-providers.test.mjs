import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { POST as chatPost } from '../api/chat.ts';
import { POST as loginPost } from '../api/auth/login.ts';
import { POST as integrationTestPost } from '../api/integrations/test.ts';

const ENV_KEYS = [
  'OWNER_API_TOKEN', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'NADA_DEFAULT_AI_PROVIDER',
];
let originalEnvironment;
let originalFetch;
let requests;

beforeEach(() => {
  originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    OWNER_API_TOKEN: 'unit-test-owner-token',
    GEMINI_API_KEY: 'fake-gemini-key', GEMINI_MODEL: 'fake-gemini-model',
    OPENAI_API_KEY: 'fake-openai-key', OPENAI_MODEL: 'fake-openai-model',
    ANTHROPIC_API_KEY: 'fake-anthropic-key', ANTHROPIC_MODEL: 'fake-claude-model',
  });
  delete process.env.NADA_DEFAULT_AI_PROVIDER;
  originalFetch = globalThis.fetch;
  requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined };
    requests.push(call);
    if (call.url.includes('/v1/messages')) return Response.json({ model: 'mock-claude', content: [{ type: 'text', text: 'رد تجريبي' }] });
    if (call.url.includes('/chat/completions')) return Response.json({ model: 'mock-chat-model', choices: [{ message: { content: 'رد تجريبي' } }] });
    if (call.url.includes('/models')) return Response.json({ data: [{ id: 'mock-model' }] });
    throw new Error('Unexpected upstream URL');
  };
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
  globalThis.fetch = originalFetch;
});

async function ownerCookie() {
  const origin = 'http://localhost';
  const response = await loginPost(new Request(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'unit-test-owner-token' }),
  }));
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

function makeRequest(path, cookie, body) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { Origin: 'http://localhost', ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('routes chat to exactly one configured provider and accepts a manual model override', async () => {
  const cookie = await ownerCookie();
  for (const provider of ['gemini', 'openai', 'anthropic']) {
    requests = [];
    const response = await chatPost(makeRequest('/api/chat', cookie, {
      provider,
      model: `manual-${provider}-model`,
      messages: [{ role: 'user', content: 'اختبار عربي' }],
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.provider, provider);
    assert.equal(payload.response, 'رد تجريبي');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, `manual-${provider}-model`);
  }
});

test('requires owner auth and validates selected provider', async () => {
  const unauthorized = await chatPost(makeRequest('/api/chat', null, { provider: 'gemini', messages: [{ role: 'user', content: 'x' }] }));
  assert.equal(unauthorized.status, 401);
  assert.equal(requests.length, 0);
  const cookie = await ownerCookie();
  const invalid = await chatPost(makeRequest('/api/chat', cookie, { provider: 'all', messages: [{ role: 'user', content: 'x' }] }));
  assert.equal(invalid.status, 400);
  assert.equal(requests.length, 0);
});

test('automatic mode uses only the configured default provider, otherwise Gemini fallback only', async () => {
  const cookie = await ownerCookie();
  process.env.NADA_DEFAULT_AI_PROVIDER = 'anthropic';
  const preferred = await chatPost(makeRequest('/api/chat', cookie, { provider: 'auto', messages: [{ role: 'user', content: 'x' }] }));
  assert.equal((await preferred.json()).provider, 'anthropic');
  assert.equal(requests.length, 1);
  requests = [];
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.NADA_DEFAULT_AI_PROVIDER;
  const unconfigured = await chatPost(makeRequest('/api/chat', cookie, { provider: 'auto', messages: [{ role: 'user', content: 'x' }] }));
  assert.equal(unconfigured.status, 409);
  assert.equal(requests.length, 0);
});

test('connection checks authenticate through model-list GET endpoints and never generate content', async () => {
  const cookie = await ownerCookie();
  for (const id of ['gemini', 'openai', 'anthropic']) {
    requests = [];
    const response = await integrationTestPost(makeRequest('/api/integrations/test', cookie, { id }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.test, 'model-list-authentication');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'GET');
    assert.ok(requests[0].url.endsWith('/models') || requests[0].url.includes('/models?'));
  }
});

test('upstream failure returns a sanitized message without provider details', async () => {
  const cookie = await ownerCookie();
  globalThis.fetch = async () => new Response('secret-provider-response', { status: 401 });
  const response = await chatPost(makeRequest('/api/chat', cookie, { provider: 'openai', messages: [{ role: 'user', content: 'x' }] }));
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(JSON.stringify(payload).includes('secret-provider-response'), false);
  assert.equal(JSON.stringify(payload).includes('fake-openai-key'), false);
});
