import { isOwnerAuthConfigured } from '../server/auth.ts';
import { envValue, json } from '../server/runtime.ts';

export function GET(): Response {
  const geminiConfigured = Boolean(envValue('GEMINI_API_KEY') && envValue('GEMINI_MODEL'));
  const aiProviders = [
    { id: 'gemini', configured: geminiConfigured },
    { id: 'openai', configured: Boolean(envValue('OPENAI_API_KEY') && envValue('OPENAI_MODEL')) },
    { id: 'anthropic', configured: Boolean(envValue('ANTHROPIC_API_KEY') && envValue('ANTHROPIC_MODEL')) },
  ];
  return json({
    ok: true,
    runtime: 'vercel-function',
    authConfigured: isOwnerAuthConfigured(),
    geminiConfigured,
    aiProviders,
    storageConfigured: false,
    checks: {
      authentication: isOwnerAuthConfigured() ? 'CONFIGURED_NOT_TESTED' : 'NOT_CONFIGURED',
      gemini: geminiConfigured ? 'CONFIGURED_NOT_TESTED' : 'NOT_CONFIGURED',
      storage: 'NOT_CONFIGURED',
    },
  });
}
