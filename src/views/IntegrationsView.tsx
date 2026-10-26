import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ViewKey } from '@/types';

type Category = 'ai' | 'speech' | 'media' | 'storage' | 'database' | 'identity' | 'custom';
type TestKind = 'gemini' | 'openai' | null;
type Integration = {
  id: string;
  name: string;
  category: Category;
  envKeys: string[];
  missingEnv: string[];
  configured: boolean;
  status: 'CONFIGURED_NOT_TESTED' | 'NOT_CONFIGURED';
  testKind: TestKind;
};
type TestResult = { ok: boolean; message: string; latencyMs?: number };
type PageState = 'loading' | 'ready' | 'unauthenticated' | 'unconfigured' | 'error';

const categoryLabels: Record<Category, string> = {
  ai: 'نماذج الذكاء الاصطناعي',
  speech: 'الصوت والكلام',
  media: 'الصور والفيديو والأفاتار',
  storage: 'التخزين والملفات',
  database: 'قواعد البيانات',
  identity: 'الهوية والخدمات الخارجية',
  custom: 'مزود مخصص',
};

const categoryOrder: Category[] = ['ai', 'speech', 'media', 'storage', 'database', 'identity', 'custom'];

export function IntegrationsView({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState('');
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<Category>('custom');
  const [customEnvKeys, setCustomEnvKeys] = useState('');
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => categoryOrder
    .map((category) => ({ category, items: integrations.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0), [integrations]);

  const loadIntegrations = async () => {
    setPageState('loading');
    setError('');
    try {
      const response = await fetch('/api/integrations', { credentials: 'include', cache: 'no-store' });
      const result = await response.json();
      if (response.status === 401) {
        setPageState('unauthenticated');
        return;
      }
      if (response.status === 503 && result.error === 'auth_not_configured') {
        setPageState('unconfigured');
        return;
      }
      if (!response.ok || !Array.isArray(result.integrations)) {
        throw new Error(result.message || `تعذّر جلب حالة التكاملات (HTTP ${response.status}).`);
      }
      setIntegrations(result.integrations as Integration[]);
      setPageState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر الاتصال بوظيفة الخادم.');
      setPageState('error');
    }
  };

  useEffect(() => {
    void loadIntegrations();
  }, []);

  const testConnection = async (id: string) => {
    setTestingId(id);
    setTestResults((previous) => ({ ...previous, [id]: { ok: false, message: 'جارٍ اختبار الاتصال…' } }));
    try {
      const response = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || `فشل الاختبار (HTTP ${response.status}).`);
      }
      setTestResults((previous) => ({
        ...previous,
        [id]: { ok: true, message: `تم التحقق من اتصال الخادم • ${result.latencyMs}ms`, latencyMs: result.latencyMs },
      }));
    } catch (cause) {
      setTestResults((previous) => ({
        ...previous,
        [id]: { ok: false, message: cause instanceof Error ? cause.message : 'فشل اختبار الاتصال.' },
      }));
    } finally {
      setTestingId('');
    }
  };

  const customDefinition = useMemo(() => {
    const envKeys = customEnvKeys.split(/[\n,،]/).map((key) => key.trim()).filter(Boolean);
    const normalizedName = customName.trim().toLowerCase();
    const latinId = normalizedName.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const unicodeId = Array.from(normalizedName).filter((character) => character.trim()).map((character) => character.codePointAt(0)?.toString(16) ?? '').join('-');
    const id = (latinId || `provider-${unicodeId}`).slice(0, 48);
    if (!id || !customName.trim() || envKeys.length === 0 || envKeys.some((key) => !/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || key.startsWith('VITE_'))) return '';
    return JSON.stringify([{ id, name: customName.trim(), category: customCategory, envKeys }], null, 2);
  }, [customName, customCategory, customEnvKeys]);

  const copyDefinition = async () => {
    if (!customDefinition || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(customDefinition);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="space-y-5 animate-fade-up" dir="rtl">
      <section className="card p-5 sm:p-7 border border-accent/25 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-accent font-bold">NADA Control Center</p>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-primary mt-1">Integrations &amp; API Keys</h1>
              <p className="text-sm text-secondary mt-2 max-w-3xl leading-6">
                حالة الإعدادات تُقرأ من الخادم فقط. لا تكتب المفتاح هنا: قيم الأسرار لا تصل إلى الواجهة ولا تُحفظ في Git أو المتصفح. الاختيار التلقائي يستخدم NADA_DEFAULT_AI_PROVIDER المحدد على الخادم، ولا يرسل الطلب إلى عدة نماذج.
              </p>
            </div>
          </div>
          <button onClick={() => void loadIntegrations()} className="px-3 py-2 rounded-xl bg-elevated border border-default text-secondary hover:text-primary text-sm flex items-center gap-2 self-start">
            <RefreshCw className="w-4 h-4" /> تحديث الحالة
          </button>
        </div>
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-elevated/70 border border-default p-3 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-secondary leading-5"><strong className="text-primary">إدارة آمنة:</strong> أضف القيم كـ Secret/Environment Variable في إعدادات مشروع Vercel على الخادم. استخدم البيئة Preview أثناء الاختبار.</p>
          </div>
          <div className="rounded-xl bg-elevated/70 border border-default p-3 flex gap-3">
            <KeyRound className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-xs text-secondary leading-5"><strong className="text-primary">المالك فقط:</strong> المسارات التي تعرض الحالة أو تختبر المزود تتطلب جلسة مالك صالحة. نتيجة «مُهيأ» لا تعني أن الاتصال تم اختباره.</p>
          </div>
        </div>
      </section>

      {pageState === 'loading' && <div className="card p-6 text-sm text-secondary flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" />جارٍ قراءة حالة الخادم…</div>}
      {pageState === 'unauthenticated' && (
        <div className="card p-5 border border-warning/30 space-y-3" role="status">
          <h2 className="font-bold text-primary">يلزم تسجيل دخول المالك</h2>
          <p className="text-sm text-secondary">لم تُعرض أي أسماء متغيرات أو حالات إعداد لأن هذه الصفحة محمية على الخادم.</p>
          <button onClick={() => onNavigate('assistant')} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">الانتقال إلى مساعد ندى لتسجيل الدخول</button>
        </div>
      )}
      {pageState === 'unconfigured' && (
        <div className="card p-5 border border-warning/30" role="alert">
          <h2 className="font-bold text-primary">مصادقة المالك غير مهيأة</h2>
          <p className="text-sm text-secondary mt-2">أضف OWNER_API_TOKEN أو OWNER_MASTER_PASSWORD في إعدادات Vercel كسر خادمي، ثم أعد المحاولة. لا تضعه في متغير يبدأ بـ VITE_.</p>
        </div>
      )}
      {pageState === 'error' && (
        <div className="card p-5 border border-red-500/30" role="alert">
          <p className="font-bold text-primary">تعذر قراءة حالة التكاملات</p>
          <p className="text-sm text-secondary mt-2">{error}</p>
        </div>
      )}

      {pageState === 'ready' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary">المزودون المسجلون</h2>
              <p className="text-xs text-muted mt-1">الحالة المعروضة: وجود متغيرات الخادم فقط؛ لا تُعلن الخدمة «تم التحقق منها» إلا بعد اختبار فعلي.</p>
            </div>
            <button onClick={() => setShowCustomForm((visible) => !visible)} className="px-3 py-2 rounded-xl bg-elevated border border-default text-secondary hover:text-primary text-sm flex items-center gap-2 self-start">
              {showCustomForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              إضافة تعريف مزود
            </button>
          </div>

          {showCustomForm && (
            <section className="card p-4 sm:p-5 space-y-3 border border-accent/25">
              <div>
                <h3 className="font-bold text-primary">تعريف مزود قابل للتوسعة</h3>
                <p className="text-xs text-secondary mt-1 leading-5">هذه الأداة لا تستقبل مفتاحًا ولا تحفظه. أنشئ تعريفًا للنسخ إلى NADA_INTEGRATION_CATALOG في إعدادات Vercel، ثم أضف كل قيمة سرية كمتغير مستقل من نوع Secret.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-secondary space-y-1">اسم المزود<input value={customName} onChange={(event) => setCustomName(event.target.value)} className="w-full mt-1 rounded-xl bg-elevated border border-default px-3 py-2 text-sm text-primary" placeholder="مثال: مزود صوت إضافي" /></label>
                <label className="text-xs text-secondary space-y-1">الفئة<select value={customCategory} onChange={(event) => setCustomCategory(event.target.value as Category)} className="w-full mt-1 rounded-xl bg-elevated border border-default px-3 py-2 text-sm text-primary">{categoryOrder.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
              </div>
              <label className="block text-xs text-secondary">أسماء متغيرات البيئة فقط (سطر أو فاصلة لكل متغير)<textarea value={customEnvKeys} onChange={(event) => setCustomEnvKeys(event.target.value)} rows={2} className="w-full mt-1 rounded-xl bg-elevated border border-default px-3 py-2 text-sm font-mono text-primary" placeholder="CUSTOM_PROVIDER_API_KEY" /></label>
              {customDefinition && <pre className="overflow-x-auto rounded-xl bg-black/20 border border-default p-3 text-[11px] text-secondary" dir="ltr">{customDefinition}</pre>}
              <button disabled={!customDefinition} onClick={() => void copyDefinition()} className="px-3 py-2 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-40 flex items-center gap-2"><Clipboard className="w-4 h-4" />{copied ? 'تم نسخ التعريف' : 'نسخ تعريف المزود'}</button>
            </section>
          )}

          {grouped.map(({ category, items }) => (
            <section key={category} className="space-y-3">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wide">{categoryLabels[category]}</h3>
              <div className="grid xl:grid-cols-2 gap-3">
                {items.map((item) => {
                  const test = testResults[item.id];
                  const stateLabel = test?.ok ? 'تم التحقق من الاتصال' : test && !test.ok && testingId !== item.id ? 'فشل آخر اختبار' : item.configured ? 'مُهيأ — لم يُختبر' : 'غير مُهيأ';
                  const stateClass = test?.ok ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' : test && testingId !== item.id ? 'text-red-400 border-red-400/30 bg-red-400/10' : item.configured ? 'text-amber-300 border-amber-300/30 bg-amber-300/10' : 'text-muted border-default bg-elevated';
                  return (
                    <article key={item.id} className="card p-4 space-y-3 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h4 className="font-bold text-primary truncate">{item.name}</h4><p className="text-[11px] text-muted mt-1 font-mono" dir="ltr">{item.id}</p></div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${stateClass}`} role="status">{stateLabel}</span>
                      </div>
                      <div className="space-y-1">
                        {item.envKeys.map((envKey) => (
                          <div key={envKey} className="flex items-center justify-between gap-2 rounded-lg bg-elevated/60 border border-default/70 px-2.5 py-2">
                            <code dir="ltr" className="text-[11px] text-secondary break-all">{envKey}</code>
                            <span className={`text-[10px] shrink-0 ${item.missingEnv.includes(envKey) ? 'text-muted' : 'text-emerald-400'}`}>{item.missingEnv.includes(envKey) ? 'غير موجود' : 'موجود'}</span>
                          </div>
                        ))}
                      </div>
                      {test && <p className={`text-xs ${test.ok ? 'text-emerald-400' : 'text-red-400'}`} aria-live="polite">{test.message}</p>}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <p className="text-[10px] text-muted">القيم تُضاف في إعدادات Vercel كـ Secret/Config، ولا تظهر هنا.</p>
                        {item.testKind ? (
                          <button disabled={!item.configured || testingId === item.id} onClick={() => void testConnection(item.id)} className="px-3 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-bold disabled:opacity-40 flex items-center gap-1.5">
                            {testingId === item.id ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : test?.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            اختبار اتصال حقيقي
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted">الاختبار الآلي غير مدعوم بعد</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="card p-4 sm:p-5 space-y-3 border border-default">
            <h3 className="font-bold text-primary">إدارة الأسرار في Vercel</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-secondary leading-5">
              <li>افتح مشروع الواجهة في Vercel ثم Settings → Environment Variables.</li>
              <li>أضف المتغيرات المطلوبة لبيئة Preview كـ Secret عند احتوائها على قيمة حساسة؛ لا تستخدم بادئة VITE_.</li>
              <li>أعد نشر Preview بعد حفظ الإعداد، ثم ارجع هنا وسجّل دخول المالك واختبر المزود المدعوم.</li>
            </ol>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-accent hover:underline"><ExternalLink className="w-3.5 h-3.5" />فتح لوحة Vercel</a>
            <p className="text-[10px] text-muted flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />اختبار Gemini يرسل طلبًا صغيرًا إلى المزود وقد يُحتسب ضمن حصتك؛ لا يُرسل تلقائيًا عند فتح الصفحة.</p>
          </section>
        </>
      )}
    </div>
  );
}
