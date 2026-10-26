import { envValue, json, readJsonObject, sameOrigin } from './runtime.ts';

const OWNER_COOKIE = 'nada_owner_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const textEncoder = new TextEncoder();

function ownerSecret(): string {
  return envValue('OWNER_MASTER_PASSWORD') || envValue('OWNER_API_TOKEN');
}

export function isOwnerAuthConfigured(): boolean {
  return ownerSecret().length > 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function getCookie(request: Request, name: string): string {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return '';
}

function cookieHeader(request: Request, value: string, clear = false): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const maxAge = clear ? 0 : SESSION_TTL_SECONDS;
  return `${OWNER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function signedCookieValue(secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = `${expires}.${toBase64Url(nonce)}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), textEncoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function hasOwnerSession(request: Request): Promise<boolean> {
  const secret = ownerSecret();
  if (!secret) return false;
  const token = getCookie(request, OWNER_COOKIE);
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{10,12}$/.test(parts[0])) return false;
  const expires = Number(parts[0]);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const nonce = fromBase64Url(parts[1]);
  const signature = fromBase64Url(parts[2]);
  if (!nonce || nonce.length !== 16 || !signature || signature.length !== 32) return false;
  try {
    const payload = `${parts[0]}.${parts[1]}`;
    const signatureBuffer = Uint8Array.from(signature).buffer as ArrayBuffer;
    return await crypto.subtle.verify('HMAC', await signingKey(secret), signatureBuffer, textEncoder.encode(payload));
  } catch {
    return false;
  }
}

export async function ownerSessionStatus(request: Request): Promise<Response> {
  const configured = isOwnerAuthConfigured();
  return json({ configured, authenticated: configured && await hasOwnerSession(request) });
}

export async function ownerLogin(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  }
  const expected = ownerSecret();
  if (!expected) {
    return json({ error: 'auth_not_configured', message: 'مصادقة المالك غير مهيأة على الخادم.' }, 503);
  }
  const body = await readJsonObject(request, 8_192);
  const supplied = typeof body?.token === 'string' ? body.token : '';
  if (!supplied || supplied.length > 4096) {
    return json({ error: 'invalid_body', message: 'رمز دخول المالك غير صالح.' }, 400);
  }

  const left = textEncoder.encode(supplied);
  const right = textEncoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  if (difference !== 0) {
    return json({ error: 'invalid_token', message: 'رمز دخول المالك غير صالح.' }, 401);
  }

  const session = await signedCookieValue(expected);
  return json({ authenticated: true }, 200, { 'Set-Cookie': cookieHeader(request, session) });
}

export function ownerLogout(request: Request): Response {
  if (!sameOrigin(request)) {
    return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  }
  return json({ logged_out: true }, 200, { 'Set-Cookie': cookieHeader(request, '', true) });
}
