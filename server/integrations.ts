import { envValue } from './runtime.ts';

export type IntegrationCategory = 'ai' | 'speech' | 'media' | 'storage' | 'database' | 'identity' | 'custom';
export type IntegrationTestKind = 'gemini' | 'openai' | 'anthropic' | null;

export interface IntegrationDefinition {
  id: string;
  name: string;
  category: IntegrationCategory;
  envKeys: string[];
  testKind: IntegrationTestKind;
}

const CATEGORY_VALUES: IntegrationCategory[] = ['ai', 'speech', 'media', 'storage', 'database', 'identity', 'custom'];
const BUILT_IN: IntegrationDefinition[] = [
  { id: 'gemini', name: 'Google Gemini', category: 'ai', envKeys: ['GEMINI_API_KEY', 'GEMINI_MODEL'], testKind: 'gemini' },
  { id: 'openai', name: 'OpenAI', category: 'ai', envKeys: ['OPENAI_API_KEY', 'OPENAI_MODEL'], testKind: 'openai' },
  { id: 'anthropic', name: 'Anthropic Claude', category: 'ai', envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'], testKind: 'anthropic' },
  { id: 'elevenlabs', name: 'ElevenLabs — الصوت', category: 'speech', envKeys: ['ELEVENLABS_API_KEY'], testKind: null },
  { id: 'google-stt', name: 'Google Cloud — تحويل الكلام إلى نص', category: 'speech', envKeys: ['GOOGLE_STT_CREDENTIALS_JSON'], testKind: null },
  { id: 'google-tts', name: 'Google Cloud — تحويل النص إلى كلام', category: 'speech', envKeys: ['GOOGLE_TTS_CREDENTIALS_JSON'], testKind: null },
  { id: 'replicate', name: 'Replicate — الصور والفيديو', category: 'media', envKeys: ['REPLICATE_API_TOKEN'], testKind: null },
  { id: 'runway', name: 'Runway — الفيديو', category: 'media', envKeys: ['RUNWAY_API_KEY'], testKind: null },
  { id: 'heygen', name: 'HeyGen — أفاتار الفيديو', category: 'media', envKeys: ['HEYGEN_API_KEY'], testKind: null },
  { id: 'google-drive', name: 'Google Drive', category: 'storage', envKeys: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'], testKind: null },
  { id: 'google-cloud-storage', name: 'Google Cloud Storage', category: 'storage', envKeys: ['GCS_PROJECT_ID', 'GCS_BUCKET_NAME', 'GCS_SERVICE_ACCOUNT_JSON'], testKind: null },
  { id: 'cloudflare-r2', name: 'Cloudflare R2', category: 'storage', envKeys: ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'], testKind: null },
  { id: 'supabase', name: 'Supabase — قاعدة البيانات', category: 'database', envKeys: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], testKind: null },
  { id: 'backup-storage', name: 'مخزن النسخ الاحتياطي', category: 'storage', envKeys: ['NADA_BACKUP_BUCKET', 'NADA_BACKUP_CREDENTIALS_JSON'], testKind: null },
  { id: 'apple-services', name: 'Apple Services', category: 'identity', envKeys: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'], testKind: null },
];

function validEnvKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value) && !value.startsWith('VITE_');
}

function customDefinitions(): IntegrationDefinition[] {
  const raw = envValue('NADA_INTEGRATION_CATALOG');
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const definitions: IntegrationDefinition[] = [];
    const usedIds = new Set(BUILT_IN.map((item) => item.id));
    for (const value of parsed.slice(0, 50)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const category = item.category;
      const envKeys = Array.isArray(item.envKeys) ? item.envKeys : [];
      if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id) || usedIds.has(id)) continue;
      if (!name || name.length > 80 || !CATEGORY_VALUES.includes(category as IntegrationCategory)) continue;
      if (envKeys.length < 1 || envKeys.length > 8 || !envKeys.every(validEnvKey)) continue;
      usedIds.add(id);
      definitions.push({
        id,
        name,
        category: category as IntegrationCategory,
        envKeys: envKeys as string[],
        testKind: null,
      });
    }
    return definitions;
  } catch {
    return [];
  }
}

export function getIntegrationDefinitions(): IntegrationDefinition[] {
  return [...BUILT_IN, ...customDefinitions()];
}

export function getIntegrationStatuses() {
  return getIntegrationDefinitions().map((definition) => {
    const missingEnv = definition.envKeys.filter((key) => !envValue(key));
    return {
      ...definition,
      configured: missingEnv.length === 0,
      missingEnv,
      status: missingEnv.length === 0 ? 'CONFIGURED_NOT_TESTED' as const : 'NOT_CONFIGURED' as const,
    };
  });
}

export function findIntegration(id: string): IntegrationDefinition | undefined {
  return getIntegrationDefinitions().find((definition) => definition.id === id);
}
