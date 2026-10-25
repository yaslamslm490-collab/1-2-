import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.API_BASE_URL;

test('Worker API contract returns JSON for health, session, chat, and unknown routes', async (t) => {
  if (!baseUrl) {
    t.skip('Set API_BASE_URL to run the live Worker contract test.');
    return;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    assert.match(contentType, /application\/json/i, `${path} must return JSON`);
    const payload = JSON.parse(body);
    assert.equal(typeof payload, 'object');
    return { response, payload };
  }

  const health = await request('/api/health');
  assert.ok([200, 503].includes(health.response.status));
  assert.equal(typeof health.payload.ok, 'boolean');

  const session = await request('/api/auth/session');
  assert.ok([200, 503].includes(session.response.status));
  assert.equal(typeof session.payload.authenticated, 'boolean');

  const chat = await request('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'اختبار عقد محلي' }] }),
  });
  assert.ok([401, 503].includes(chat.response.status));
  assert.ok(typeof chat.payload.error === 'string');

  const unknown = await request('/api/not-found');
  assert.equal(unknown.response.status, 404);
  assert.equal(unknown.payload.error, 'not_found');
});
