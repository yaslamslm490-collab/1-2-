interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface StaticAssets {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: StaticAssets;
  DB: D1Database;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OWNER_MASTER_PASSWORD?: string;
  OWNER_API_TOKEN?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SESSION_COOKIE = 'nada_owner_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_BODY_BYTES = 1_000_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const outputHeaders = new Headers(headers);
  outputHeaders.set('Content-Type', 'application/json; charset=utf-8');
  outputHeaders.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: outputHeaders });
}

function ownerSecret(env: Env): string {
  return (env.OWNER_MASTER_PASSWORD || env.OWNER_API_TOKEN || '').trim();
}

function equalSecret(candidate: string, expected: string): boolean {
  const left = new TextEncoder().encode(candidate);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }
  return difference === 0;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, '0')).join('');
}

function randomSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (part) => part.toString(16).padStart(2, '0')).join('');
}

function sessionCookie(value: string, request: Request, clear = false): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const maxAge = clear ? 0 : SESSION_TTL_SECONDS;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function cookieValue(request: Request, name: string): string {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

async function currentSessionHash(request: Request, env: Env): Promise<string | null> {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(sessionId)) return null;
  const sessionHash = await sha256(sessionId);
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT expires_at FROM owner_sessions WHERE session_hash = ?'
  ).bind(sessionHash).first<{ expires_at: number }>();
  if (!row || row.expires_at <= now) {
    if (row) await env.DB.prepare('DELETE FROM owner_sessions WHERE session_hash = ?').bind(sessionHash).run();
    return null;
  }
  return sessionHash;
}

async function loginIpHash(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return sha256(ip);
}

async function isLoginRateLimited(env: Env, ipHash: string): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT attempts, window_started_at FROM owner_login_attempts WHERE ip_hash = ?'
  ).bind(ipHash).first<{ attempts: number; window_started_at: number }>();
  return Boolean(row && row.window_started_at > now - LOGIN_WINDOW_MS && row.attempts >= MAX_LOGIN_ATTEMPTS);
}

async function recordLoginFailure(env: Env, ipHash: string): Promise<void> {
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT attempts, window_started_at FROM owner_login_attempts WHERE ip_hash = ?'
  ).bind(ipHash).first<{ attempts: number; window_started_at: number }>();
  if (!row || row.window_started_at <= now - LOGIN_WINDOW_MS) {
    await env.DB.prepare(
      'INSERT INTO owner_login_attempts (ip_hash, attempts, window_started_at) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at'
    ).bind(ipHash, now).run();
    return;
  }
  await env.DB.prepare(
    'UPDATE owner_login_attempts SET attempts = attempts + 1 WHERE ip_hash = ?'
  ).bind(ipHash).run();
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) return null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bodyBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bodyBytes));
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function handleHealth(env: Env): Promise<Response> {
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({
      ok: true,
      database: 'connected',
      authConfigured: Boolean(ownerSecret(env)),
      geminiConfigured: Boolean(env.GEMINI_API_KEY?.trim() && env.GEMINI_MODEL?.trim()),
    });
  } catch {
    return json({ ok: false, database: 'unavailable' }, 503);
  }
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  try {
    const configured = Boolean(ownerSecret(env));
    const authenticated = configured && Boolean(await currentSessionHash(request, env));
    return json({ authenticated, configured });
  } catch {
    return json({ authenticated: false, configured: Boolean(ownerSecret(env)), error: 'd1_unavailable' }, 503);
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  const expected = ownerSecret(env);
  if (!expected) return json({ error: 'auth_not_configured', message: 'مصادقة المالك غير مهيأة على الخادم.' }, 503);
  const body = await parseJson(request);
  if (!body || typeof body.token !== 'string') {
    return json({ error: 'invalid_body', message: 'أرسل رمز المالك بصيغة JSON صالحة.' }, 400);
  }
  const supplied = body.token;
  const ipHash = await loginIpHash(request);
  try {
    if (await isLoginRateLimited(env, ipHash)) {
      return json({ error: 'too_many_auth_attempts', message: 'توقفت محاولات الدخول مؤقتًا؛ حاول بعد عشر دقائق.' }, 429);
    }
    if (!equalSecret(supplied, expected)) {
      await recordLoginFailure(env, ipHash);
      return json({ error: 'invalid_token', message: 'رمز دخول المالك غير صالح.' }, 401);
    }
    const sessionId = randomSessionId();
    const sessionHash = await sha256(sessionId);
    const now = Date.now();
    await env.DB.prepare('DELETE FROM owner_sessions WHERE expires_at <= ?').bind(now).run();
    await env.DB.prepare(
      'INSERT INTO owner_sessions (session_hash, created_at, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionHash, now, now + SESSION_TTL_SECONDS * 1000).run();
    await env.DB.prepare('DELETE FROM owner_login_attempts WHERE ip_hash = ?').bind(ipHash).run();
    return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(sessionId, request) });
  } catch {
    return json({ error: 'd1_unavailable', message: 'تعذّر إنشاء جلسة آمنة في قاعدة البيانات.' }, 503);
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  try {
    const sessionHash = await currentSessionHash(request, env);
    if (sessionHash) await env.DB.prepare('DELETE FROM owner_sessions WHERE session_hash = ?').bind(sessionHash).run();
    return json({ logged_out: true }, 200, { 'Set-Cookie': sessionCookie('', request, true) });
  } catch {
    return json({ error: 'd1_unavailable', message: 'تعذّر إنهاء الجلسة.' }, 503);
  }
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  if (!ownerSecret(env)) return json({ error: 'auth_not_configured', message: 'مصادقة المالك غير مهيأة على الخادم.' }, 503);
  try {
    if (!(await currentSessionHash(request, env))) {
      return json({ error: 'authentication_required', message: 'سجّل دخول المالك قبل استخدام ندى.' }, 401);
    }
  } catch {
    return json({ error: 'd1_unavailable', message: 'تعذّر التحقق من جلسة المالك.' }, 503);
  }
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  if (!apiKey || !model) {
    return json({ error: 'gemini_not_configured', message: 'Gemini غير مهيأ: أضف GEMINI_API_KEY كسرّ وGEMINI_MODEL كإعداد خادم.' }, 503);
  }
  const body = await parseJson(request);
  const rawMessages = body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length < 1 || rawMessages.length > MAX_MESSAGES) {
    return json({ error: 'invalid_messages', message: 'سجل المحادثة غير صالح أو أطول من الحد المسموح.' }, 400);
  }
  const messages: ChatMessage[] = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return json({ error: 'invalid_messages', message: 'رسالة المحادثة غير صالحة.' }, 400);
    }
    const candidate = item as Record<string, unknown>;
    if (
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string' ||
      !candidate.content.trim() ||
      candidate.content.length > MAX_MESSAGE_CHARS
    ) {
      return json({ error: 'invalid_messages', message: 'رسالة المحادثة غير صالحة.' }, 400);
    }
    messages.push({ role: candidate.role, content: candidate.content.trim() });
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return json({ error: 'invalid_messages', message: 'يجب أن تنتهي المحادثة برسالة من المستخدم.' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const upstream = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'أنت ندى، مساعد NADA AI Media OS. أجب بالعربية بوضوح، واستفد من سجل المحادثة المرسل. لا تدّع تنفيذ إجراء خارجي.' },
          ...messages,
        ],
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return json({ error: 'gemini_request_failed', message: `رفض Gemini الطلب (HTTP ${upstream.status}).` }, 502);
    }
    const result = await upstream.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const answer = result.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      return json({ error: 'gemini_invalid_response', message: 'أعاد Gemini استجابة غير صالحة.' }, 502);
    }
    return json({ response: answer.slice(0, 12_000), model });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return json({
      error: 'gemini_request_failed',
      message: timedOut ? 'انتهت مهلة اتصال Gemini.' : 'تعذّر الاتصال بخدمة Gemini.',
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/health' && request.method === 'GET') return handleHealth(env);
    if (url.pathname === '/api/auth/session' && request.method === 'GET') return handleSession(request, env);
    if (url.pathname === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/chat' && request.method === 'POST') return handleChat(request, env);
    return json({ error: 'not_found', message: 'المسار غير موجود.' }, 404);
  },
};
