import { hasOwnerSession } from '../server/auth.ts';
import { envValue, json, readJsonObject, sameOrigin } from '../server/runtime.ts';

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_MODEL_CHARS = 120;
const SYSTEM_PROMPT = 'أنت ندى، مساعدة عربية ودودة وواضحة في منصة NADA AI Media OS. أجيبي باللغة العربية ما لم يطلب المستخدم غير ذلك. استخدمي سياق الرسائل السابقة، ولا تدّعي تنفيذ إجراء أو امتلاك معلومة غير مؤكدة.';

type Provider = 'gemini' | 'openai' | 'anthropic';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const PROVIDERS: Provider[] = ['gemini', 'openai', 'anthropic'];
const CONFIG: Record<Provider, { key: string; model: string; url: string }> = {
  gemini: {
    key: 'GEMINI_API_KEY',
    model: 'GEMINI_MODEL',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
  openai: {
    key: 'OPENAI_API_KEY',
    model: 'OPENAI_MODEL',
    url: 'https://api.openai.com/v1/chat/completions',
  },
  anthropic: {
    key: 'ANTHROPIC_API_KEY',
    model: 'ANTHROPIC_MODEL',
    url: 'https://api.anthropic.com/v1/messages',
  },
};

function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDERS.includes(value as Provider);
}

function isConfigured(provider: Provider): boolean {
  const config = CONFIG[provider];
  return Boolean(envValue(config.key) && envValue(config.model));
}

function availableProviders(): Provider[] {
  return PROVIDERS.filter(isConfigured);
}

function resolveProvider(value: unknown): Provider | null {
  if (isProvider(value)) return isConfigured(value) ? value : null;
  const preferred = envValue('NADA_DEFAULT_AI_PROVIDER');
  if (isProvider(preferred) && isConfigured(preferred)) return preferred;
  // Keep the current product default stable; never fan out to multiple providers.
  return isConfigured('gemini') ? 'gemini' : null;
}

function validModelOverride(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= MAX_MODEL_CHARS && /^[A-Za-z0-9._:/-]+$/.test(value));
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'csrf_validation_failed', message: 'تم رفض مصدر الطلب.' }, 403);
  if (!await hasOwnerSession(request)) return json({ error: 'unauthorized', message: 'سجّل دخول المالك أولًا.' }, 401);

  const body = await readJsonObject(request, 256_000);
  const input = body?.messages;
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_MESSAGES) {
    return json({ error: 'invalid_messages', message: 'أرسل من 1 إلى 20 رسالة محادثة.' }, 400);
  }

  if (body?.provider !== undefined && body.provider !== 'auto' && !isProvider(body.provider)) {
    return json({ error: 'invalid_provider', message: 'اختيار مزود الذكاء الاصطناعي غير صالح.' }, 400);
  }
  if (!validModelOverride(body?.model)) {
    return json({ error: 'invalid_model', message: 'معرّف النموذج غير صالح.' }, 400);
  }

  const messages: ChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return json({ error: 'invalid_messages', message: 'صيغة سجل المحادثة غير صالحة.' }, 400);
    }
    const message = item as Record<string, unknown>;
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_CHARS) {
      return json({ error: 'invalid_messages', message: 'تحتوي المحادثة على رسالة غير صالحة.' }, 400);
    }
    messages.push({ role: message.role, content: message.content.trim() });
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return json({ error: 'invalid_messages', message: 'يجب أن تنتهي المحادثة برسالة من المستخدم.' }, 400);
  }

  const selectedProvider = resolveProvider(body?.provider);
  if (!selectedProvider) {
    return json({
      error: 'provider_not_configured',
      message: body?.provider && body.provider !== 'auto'
        ? 'المزود المختار غير مهيأ. أضف إعداداته في أسرار الخادم أو اختر مزودًا مهيأً.'
        : 'لا يوجد مزود افتراضي مهيأ. اضبط NADA_DEFAULT_AI_PROVIDER واختر مزودًا متاحًا من واجهة المحادثة.',
      availableProviders: availableProviders(),
    }, 409);
  }

  const providerConfig = CONFIG[selectedProvider];
  const apiKey = envValue(providerConfig.key);
  const model = (typeof body?.model === 'string' && body.model.trim()) || envValue(providerConfig.model);
  if (!apiKey || !model) {
    return json({ error: 'provider_not_configured', message: 'المزود المختار غير مهيأ بالكامل؛ يلزم مفتاح الخادم ومعرّف النموذج.' }, 409);
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let payload: Record<string, unknown>;
    if (selectedProvider === 'anthropic') {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['anthropic-version'] = '2023-06-01';
      payload = {
        model,
        system: SYSTEM_PROMPT,
        messages,
        max_tokens: 900,
        temperature: 0.7,
      };
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
      payload = {
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: 900,
      };
    }

    const upstream = await fetch(providerConfig.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return json({ error: 'provider_upstream_error', message: `تعذّر إكمال الطلب لدى المزود المختار (HTTP ${upstream.status}).`, provider: selectedProvider }, 502);
    }

    const result = await upstream.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
      model?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    };
    const content = selectedProvider === 'anthropic'
      ? result.content?.filter((block) => block.type === 'text').map((block) => typeof block.text === 'string' ? block.text : '').join('\n')
      : result.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return json({ error: 'provider_empty_response', message: 'أعاد المزود استجابة فارغة أو غير متوقعة.', provider: selectedProvider }, 502);
    }
    return json({ response: content.trim(), provider: selectedProvider, model: result.model || model, executionTimeMs: Date.now() - startedAt });
  } catch (error) {
    const timeoutError = error instanceof Error && error.name === 'AbortError';
    return json({
      error: timeoutError ? 'provider_timeout' : 'provider_unreachable',
      message: timeoutError ? 'انتهت مهلة اتصال مزود الذكاء الاصطناعي؛ حاول مجددًا.' : 'تعذّر الاتصال بمزود الذكاء الاصطناعي من الخادم.',
      provider: selectedProvider,
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
