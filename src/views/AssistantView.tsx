import { type FormEvent, useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import {
  speakArabic,
  stopSpeaking,
  createArabicSpeechRecognizer,
  isSpeechRecognitionSupported,
} from '@/utils/speech';
import type { MemoryEntry, ViewKey } from '@/types';
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  User,
  Clock,
  Layers,
  Paperclip,
  Video,
  ArrowUpRight,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  retrievedMemory?: MemoryEntry[];
  executionTimeMs?: number;
}

const NADA_AVATAR_SRC = '/assets/characters/nada/nada-official.png';

interface ApiHealth {
  geminiConfigured?: boolean;
  authConfigured?: boolean;
  aiProviders?: Array<{ id: string; configured: boolean }>;
  checks?: {
    gemini?: string;
    authentication?: string;
  };
}

interface ApiSession {
  configured?: boolean;
  authenticated?: boolean;
}

type AiProvider = 'gemini' | 'openai' | 'anthropic';
const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
};

function isConfiguredServiceStatus(status: unknown): boolean {
  return status === 'ONLINE' || status === 'CONFIGURED_NOT_TESTED';
}

export function AssistantView({ onNavigate }: { onNavigate?: (key: ViewKey) => void }) {
  const { currentUser, characters } = useApp();

  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('جارٍ فحص الخادم…');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'signed-out' | 'authenticated' | 'unconfigured' | 'error'>('checking');
  const [ownerToken, setOwnerToken] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<AiProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<'auto' | AiProvider>('auto');
  const [modelOverride, setModelOverride] = useState('');
  const recognizerRef = useRef<ReturnType<typeof createArabicSpeechRecognizer> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestAssistantMessage = [...messages].reverse().find((message) => message.sender === 'assistant');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let active = true;
    const checkServer = async () => {
      try {
        const [healthResponse, sessionResponse] = await Promise.all([
          fetch('/api/health', { credentials: 'include' }),
          fetch('/api/auth/session', { credentials: 'include' }),
        ]);
        const [healthPayload, sessionPayload] = await Promise.all([healthResponse.json(), sessionResponse.json()]);
        const health = healthPayload as ApiHealth;
        const session = sessionPayload as ApiSession;
        if (!active) return;
        if (!healthResponse.ok || !sessionResponse.ok) throw new Error('تعذّر فحص حالة الخادم.');
        const hasGemini = typeof health.geminiConfigured === 'boolean'
          ? health.geminiConfigured
          : isConfiguredServiceStatus(health.checks?.gemini);
        const configuredProviders = (health.aiProviders ?? [{ id: 'gemini', configured: hasGemini }])
          .filter((provider) => provider.configured && provider.id in AI_PROVIDER_LABELS)
          .map((provider) => provider.id as AiProvider);
        setAvailableProviders(configuredProviders);
        const providerSummary = configuredProviders.length > 0 ? 'يوجد مزود مهيأ — لم يُختبر بعد' : 'لا يوجد مزود ذكاء اصطناعي مهيأ';
        const authConfigured = typeof session.configured === 'boolean'
          ? session.configured
          : typeof health.authConfigured === 'boolean'
            ? health.authConfigured
            : isConfiguredServiceStatus(health.checks?.authentication);
        if (!authConfigured) {
          setAuthStatus('unconfigured');
          setConnectionStatus('مصادقة المالك غير مهيأة');
        } else if (session.authenticated) {
          setAuthStatus('authenticated');
          setConnectionStatus(providerSummary);
        } else {
          setAuthStatus('signed-out');
          setConnectionStatus(`الخادم متاح • يلزم تسجيل دخول المالك • ${providerSummary}`);
        }
      } catch {
        if (!active) return;
        setAuthStatus('error');
        setConnectionStatus('فشل فحص اتصال الخادم');
      }
    };
    void checkServer();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerToken.trim() || isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: ownerToken }),
      });
      const result = await response.json();
      if (!response.ok || result.authenticated !== true) {
        throw new Error(result.message || `تعذّر تسجيل الدخول (HTTP ${response.status}).`);
      }
      setOwnerToken('');
      setAuthStatus('authenticated');
      setConnectionStatus(availableProviders.length > 0 ? 'جلسة المالك جاهزة • يوجد مزود مهيأ ولم يُختبر بعد' : 'جلسة المالك جاهزة • لا يوجد مزود مهيأ');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'تعذّر تسجيل الدخول.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Clear the client-side state even if the logout request cannot reach the server.
    } finally {
      setMessages([]);
      setAuthStatus('signed-out');
      setConnectionStatus('تم تسجيل الخروج');
    }
  };

  // Voice Input (STT) setup
  const toggleListening = () => {
    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
      return;
    }

    setSpeechError(null);
    if (!isSpeechRecognitionSupported()) {
      setSpeechError('التعرف الصوتي غير متاح في هذا المتصفح. يمكنك كتابة رسالتك بدلًا منه.');
      return;
    }

    const recognizer = createArabicSpeechRecognizer(
      (transcript, isFinal) => {
        setInputPrompt(transcript);
        if (isFinal) {
          setIsListening(false);
        }
      },
      (err) => {
        setSpeechError(err);
        setIsListening(false);
      },
      () => {
        setIsListening(false);
      }
    );

    if (recognizer) {
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
        setIsListening(true);
      } catch {
        recognizerRef.current = null;
        setSpeechError('تعذّر بدء التعرف الصوتي. تحقّق من إذن الميكروفون واتصال الصفحة الآمن ثم حاول مجددًا.');
      }
    }
  };

  const handleSpeakText = (text: string) => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    const speechStarted = speakArabic(text, {
      pitch: 1.05,
      rate: 1.0,
      voiceGender: 'female',
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
    if (!speechStarted) {
      setIsSpeaking(false);
      setSpeechError('لم يبدأ النطق الصوتي؛ قد لا يدعمه هذا المتصفح أو تعذّر تشغيله.');
    }
  };

  const handleSendPrompt = async (promptText?: string) => {
    const textToSend = (promptText || inputPrompt).trim();
    if (!textToSend || isSending || authStatus !== 'authenticated') return;
    setIsSending(true);

    const userMsg: ChatMessage = {
      id: 'usr-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('ar-EG'),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setConnectionStatus('جارٍ الاتصال بالخادم…');

    const startedAt = Date.now();
    const history = [...messages, userMsg]
      .filter((message) => message.id !== 'm1')
      .slice(-20)
      .map(({ sender, text }) => ({ role: sender === 'assistant' ? 'assistant' : 'user', content: text }));
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: history, provider: selectedProvider, model: modelOverride.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.response !== 'string') {
        if (response.status === 401) setAuthStatus('signed-out');
        throw new Error(result.message || result.error?.message || `تعذّر تنفيذ الطلب (HTTP ${response.status}).`);
      }
      const providerLabel = AI_PROVIDER_LABELS[result.provider as AiProvider] || result.provider || 'المزود';
      setConnectionStatus(`استجابة حقيقية من ${providerLabel} • ${result.model || ''}`);
      const assistantMsg: ChatMessage = {
        id: 'ast-' + Date.now(),
        sender: 'assistant',
        text: result.response,
        timestamp: new Date().toLocaleTimeString('ar-EG'),
        executionTimeMs: Date.now() - startedAt,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      setConnectionStatus('فشل الاتصال بالخادم');
      const assistantMsg: ChatMessage = {
        id: 'ast-error-' + Date.now(),
        sender: 'assistant',
        text: error instanceof Error ? error.message : 'تعذّر الاتصال بخادم NADA AI.',
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-up max-w-5xl mx-auto">
      {/* NADA visual stage */}
      <section className="card p-4 sm:p-5 bg-gradient-to-l from-[var(--bg-card)] to-[var(--bg-elevated)] space-y-4">
        <div className="grid md:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)] gap-4 items-center">
          <div className="min-h-[230px] sm:min-h-[285px] rounded-2xl bg-black/10 border border-default/70 flex items-center justify-center overflow-hidden p-2">
            <img
              src={NADA_AVATAR_SRC}
              alt="الصورة الرسمية لندى — NADA AI"
              className="max-h-[270px] sm:max-h-[330px] max-w-full w-auto object-contain rounded-xl"
              style={{ objectPosition: '50% 30%' }}
            />
          </div>
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-full bg-accent/15 text-accent font-bold">NADA AI</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-elevated border border-default text-secondary" role="status">{connectionStatus}</span>
            </div>
            <div>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-primary">ندى — الشاشة المرئية</h2>
              <p className="text-xs sm:text-sm text-muted mt-1 leading-5">الصورة الرسمية محفوظة كما هي. الإدخال الصوتي وإخراج الكلام يعتمدان على دعم المتصفح وصلاحياته؛ لا توجد مكالمة فيديو مباشرة موصولة حاليًا.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleListening} disabled={authStatus !== 'authenticated'} className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 disabled:opacity-40 ${isListening ? 'bg-red-500 text-white border-red-600' : 'bg-elevated border-default text-secondary'}`} title={isListening ? 'إيقاف الاستماع' : 'بدء التعرف الصوتي إذا دعمه المتصفح'}>
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}{isListening ? 'إيقاف الاستماع' : 'الميكروفون'}
              </button>
              <button type="button" onClick={() => latestAssistantMessage && handleSpeakText(latestAssistantMessage.text)} disabled={!latestAssistantMessage || authStatus !== 'authenticated'} className="px-3 py-2 rounded-xl border border-default bg-elevated text-secondary text-xs font-bold flex items-center gap-2 disabled:opacity-40" title="قراءة آخر رد عبر نطق المتصفح">
                <Volume2 className="w-4 h-4" />{isSpeaking ? 'إيقاف/تشغيل الصوت' : 'قراءة آخر رد'}
              </button>
              <button type="button" disabled title="مكالمة الفيديو غير مُعدّة؛ لا يوجد فيديو حي" className="px-3 py-2 rounded-xl border border-default bg-elevated text-muted text-xs font-bold flex items-center gap-2 opacity-70">
                <Video className="w-4 h-4" />مكالمة فيديو — غير مُعدّة
              </button>
              <button type="button" disabled title="رفع المرفقات غير مهيأ في API الحالي" className="px-3 py-2 rounded-xl border border-default bg-elevated text-muted text-xs font-bold flex items-center gap-2 opacity-70">
                <Paperclip className="w-4 h-4" />المرفقات غير مفعّلة
              </button>
            </div>
            {authStatus === 'authenticated' && (
              <button
                onClick={() => onNavigate?.('integrations')}
                className="text-xs text-accent hover:underline flex items-center gap-1.5"
              >
                فتح مركز التكاملات ومفاتيح الخدمات <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {characters.length > 0 && (
          <div className="border-t border-default/70 pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-bold text-secondary">ملفات الشخصيات ({characters.length})</p>
              <p className="text-[10px] text-muted">اختر اسمًا لفتح ملفه؛ هذا لا يبدّل هوية محادثة ندى.</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="روابط ملفات الشخصيات">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => {
                    onNavigate?.('characters');
                    window.location.hash = `characters/${character.id}`;
                  }}
                  className="shrink-0 px-3 py-2 rounded-xl bg-elevated border border-default text-xs text-secondary hover:text-accent hover:border-accent/50 transition-colors"
                  title={`فتح ملف ${character.name}`}
                >
                  {character.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-default/70 pt-3">
          {authStatus === 'authenticated' && (
            <button
              onClick={() => void handleLogout()}
              className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-elevated/80 border border-default text-xs font-medium text-secondary transition-colors"
            >
              تسجيل الخروج
            </button>
          )}
          {isSpeaking && (
            <button
              onClick={() => {
                stopSpeaking();
                setIsSpeaking(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-error text-xs font-bold flex items-center gap-1.5"
            >
              <VolumeX className="w-3.5 h-3.5" />
              إيقاف الصوت
            </button>
          )}
          <button
            onClick={() => onNavigate?.('memory')}
            className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-elevated/80 border border-default text-xs font-medium text-secondary transition-colors"
          >
            فحص الذاكرة الدائمة
          </button>
        </div>
      </section>

      {speechError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-warning flex items-center justify-between">
          <span>{speechError}</span>
          <button onClick={() => setSpeechError(null)} className="font-bold px-2">
            ✕
          </button>
        </div>
      )}

      {authStatus !== 'authenticated' && (
        <div className="card p-6 space-y-4" aria-live="polite">
          {authStatus === 'checking' && <p className="text-sm text-secondary">جارٍ التحقق من الخادم والجلسة…</p>}
          {authStatus === 'unconfigured' && (
            <div className="space-y-2">
              <h3 className="font-bold text-primary">مصادقة المالك غير مهيأة</h3>
              <p className="text-sm text-secondary">مصادقة المالك غير مهيأة في بيئة الخادم. اضبط OWNER_MASTER_PASSWORD أو OWNER_API_TOKEN في مدير الأسرار؛ لا تضعهما في الواجهة أو GitHub.</p>
            </div>
          )}
          {authStatus === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-error">تعذّر الاتصال بالخادم أو قاعدة البيانات. لم تُرسل أي رسالة إلى Gemini.</p>
              <button onClick={() => window.location.reload()} className="px-3 py-2 rounded-lg bg-elevated border border-default text-sm text-secondary">إعادة فحص الاتصال</button>
            </div>
          )}
          {authStatus === 'signed-out' && (
            <form onSubmit={(event) => void handleLogin(event)} className="space-y-3 max-w-md">
              <div>
                <h3 className="font-bold text-primary">تسجيل دخول المالك</h3>
                <p className="text-xs text-muted mt-1">رمز المالك يُرسل إلى الخادم الآمن ولا يُحفظ في المتصفح.</p>
              </div>
              <input
                type="password"
                value={ownerToken}
                onChange={(event) => setOwnerToken(event.target.value)}
                autoComplete="current-password"
                placeholder="رمز دخول المالك"
                className="w-full rounded-xl bg-elevated border border-default px-4 py-3 text-sm text-primary outline-none focus:border-accent"
                aria-label="رمز دخول المالك"
              />
              {authError && <p role="alert" className="text-sm text-error">{authError}</p>}
              <button type="submit" disabled={!ownerToken.trim() || isAuthenticating} className="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-bold disabled:opacity-40">
                {isAuthenticating ? 'جارٍ التحقق…' : 'دخول آمن'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Chat Messages Log */}
      <div className={`card p-4 sm:p-6 min-h-[420px] max-h-[560px] overflow-y-auto space-y-4 ${authStatus !== 'authenticated' ? 'hidden' : ''}`}>
        {messages.length === 0 && (
          <div className="min-h-[360px] flex flex-col items-center justify-center text-center text-muted gap-3">
            <img
              src={NADA_AVATAR_SRC}
              alt="ندى — NADA AI"
              className="w-10 h-10 rounded-full object-cover shadow-md"
              style={{ objectPosition: '50% 30%' }}
            />
            <p className="text-sm">ابدأ محادثة جديدة؛ سيظهر الرد بعد استلام إجابة حقيقية من المزود المختار.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white'
                  : 'bg-elevated border border-default text-accent'
              }`}
            >
              {msg.sender === 'user' ? (
                <User className="w-4 h-4" />
              ) : (
                <img
                  src={NADA_AVATAR_SRC}
                  alt="ندى — NADA AI"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: '50% 30%' }}
                />
              )}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-accent text-white rounded-tr-none'
                  : 'bg-elevated border border-default text-primary rounded-tl-none'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] opacity-75">
                <span>{msg.sender === 'user' ? currentUser.name : 'NADA Assistant'}</span>
                <span>{msg.timestamp}</span>
              </div>

              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Action Bar for Assistant Message */}
              {msg.sender === 'assistant' && (
                <div className="mt-3 pt-2 border-t border-default/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => handleSpeakText(msg.text)}
                    className="flex items-center gap-1.5 text-accent hover:underline font-medium text-[11px]"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    استمع للنطق الصوتي
                  </button>

                  {msg.executionTimeMs !== undefined && (
                    <span className="text-[10px] text-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      استجابة الخادم في {msg.executionTimeMs}ms
                    </span>
                  )}
                </div>
              )}

              {/* Memory Citations Dropdown if present */}
              {msg.retrievedMemory && msg.retrievedMemory.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-default/40">
                  <span className="text-[10px] text-muted flex items-center gap-1 mb-1 font-semibold">
                    <Layers className="w-3 h-3 text-accent" />
                    المراجع المسترجعة من الذاكرة الدائمة:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.retrievedMemory.map((mem) => (
                      <span
                        key={mem.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-card)] border border-default/60 text-secondary"
                        title={mem.content}
                      >
                        {mem.title} ({Math.round(mem.confidence * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className={`flex flex-wrap gap-2 pt-1 ${authStatus !== 'authenticated' ? 'hidden' : ''}`}>
        {[
          'ما هي حالة المشروعات الحالية؟',
          'استرجع قرارات المالك المسجلة',
          'اقترح فكرة سكريبت لعم حسن',
          'أعطني ملخص تسليم واستئناف فوري',
        ].map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSendPrompt(prompt)}
            className="text-xs px-3 py-1.5 rounded-xl bg-elevated hover:bg-elevated/80 border border-default text-secondary hover:text-accent transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-accent" />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      {/* Input Form with Arabic Voice STT */}
      <div className={`card px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 ${authStatus !== 'authenticated' ? 'hidden' : ''}`}>
        <label className="text-xs text-secondary space-y-1">
          مزود الذكاء الاصطناعي
          <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value as 'auto' | AiProvider)} disabled={isSending} className="w-full mt-1 rounded-xl bg-elevated border border-default px-3 py-2.5 text-sm text-primary">
            <option value="auto">تلقائي — إعداد الخادم الافتراضي</option>
            {(['gemini', 'openai', 'anthropic'] as AiProvider[]).map((provider) => (
              <option key={provider} value={provider} disabled={!availableProviders.includes(provider)}>
                {AI_PROVIDER_LABELS[provider]}{availableProviders.includes(provider) ? ' — مهيأ' : ' — غير مهيأ'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-secondary space-y-1">
          معرّف نموذج اختياري
          <input value={modelOverride} onChange={(event) => setModelOverride(event.target.value)} disabled={isSending} maxLength={120} dir="ltr" className="w-full mt-1 rounded-xl bg-elevated border border-default px-3 py-2.5 text-sm text-primary" placeholder="استخدم قيمة الخادم الافتراضية" />
        </label>
        <p className="sm:col-span-2 text-[11px] text-muted">يختار «تلقائي» مزودًا افتراضيًا واحدًا فقط. قد تُحسب رسوم حسب خطة المزود لكل رسالة؛ لا تُرسل أي رسالة إلا بعد مراجعة إعداد الاستخدام لدى المزود.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendPrompt();
        }}
        className={`card p-3 flex items-center gap-2 ${authStatus !== 'authenticated' ? 'hidden' : ''}`}
      >
        <button
          type="button"
          onClick={toggleListening}
          className={`p-3 rounded-xl border transition-all flex items-center justify-center flex-shrink-0 ${
            isListening
              ? 'bg-red-500 text-white border-red-600 animate-pulse'
              : 'bg-elevated text-secondary hover:text-accent border-default'
          }`}
          title={isListening ? 'إيقاف التسجيل' : 'تحدث صوتياً بالعربية (STT)'}
        >
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder={
            isListening
              ? 'جارٍ الاستماع لصوتك بالعربية...'
              : 'اكتب أمرك أو استفسارك للمساعد NADA...'
          }
          className="flex-1 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted outline-none"
        />

        <button
          type="submit"
          disabled={!inputPrompt.trim() || isSending}
          className="p-3 rounded-xl bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center flex-shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
