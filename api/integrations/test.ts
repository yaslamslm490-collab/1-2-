import { hasOwnerSession } from '../../server/auth.ts';
import { findIntegration } from '../../server/integrations.ts';
import { envValue, json, readJsonObject, sameOrigin } from '../../server/runtime.ts';

const MODEL_ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models?limit=1',
} as const;

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  if (!await hasOwnerSession(request)) return json({ error: 'unauthorized', message: 'سجّل دخول المالك أولًا.' }, 401);
  const body = await readJsonObject(request, 8_192);
  const id = typeof body?.id === 'string' ? body.id : '';
  const integration = findIntegration(id);
  if (!integration) return json({ error: 'unknown_integration', message: 'المزود المطلوب غير موجود في السجل.' }, 404);
  if (!integration.envKeys.every((name) => envValue(name))) {
    return json({ error: 'not_configured', message: 'الإعدادات المطلوبة لهذا المزود غير مكتملة.' }, 409);
  }
  if (integration.testKind !== 'gemini' && integration.testKind !== 'openai' && integration.testKind !== 'anthropic') {
    return json({ error: 'test_unsupported', message: 'لم يُنفذ اختبار اتصال آلي لهذا المزود بعد.' }, 501);
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKeyName = integration.testKind === 'gemini'
      ? 'GEMINI_API_KEY'
      : integration.testKind === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    if (integration.testKind === 'anthropic') {
      headers.Authorization = `Bearer ${envValue(apiKeyName)}`;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers.Authorization = `Bearer ${envValue(apiKeyName)}`;
    }
    const response = await fetch(MODEL_ENDPOINTS[integration.testKind], {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      return json({ error: 'provider_rejected', message: `رفض المزود فحص الاعتماد (HTTP ${response.status}).`, httpStatus: response.status }, 502);
    }
    return json({
      ok: true,
      status: 'VERIFIED',
      provider: integration.id,
      test: 'model-list-authentication',
      latencyMs: Date.now() - startedAt,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return json({ error: timedOut ? 'provider_timeout' : 'provider_unreachable', message: timedOut ? 'انتهت مهلة اختبار الاتصال.' : 'تعذّر الوصول إلى المزود من الخادم.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
