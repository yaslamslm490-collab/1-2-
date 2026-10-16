import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import {
  speakArabic,
  stopSpeaking,
  createArabicSpeechRecognizer,
  isSpeechRecognitionSupported,
} from '@/utils/speech';
import type { MemoryEntry } from '@/types';
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Bot,
  User,
  Clock,
  Layers,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  retrievedMemory?: MemoryEntry[];
  executionTimeMs?: number;
}

export function AssistantView({ onNavigate }: { onNavigate?: (key: string) => void }) {
  const { currentUser } = useApp();

  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'assistant',
      text: `أهلاً بك يا ${currentUser.name} في المساعد الشخصي NADA AI. أرسل سؤالك وسأحاول الوصول إلى خادم Gemini عبر اتصال آمن.`,
      timestamp: 'الآن',
    },
  ]);

  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('لم يُختبر اتصال الخادم بعد');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createArabicSpeechRecognizer> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      recognizer.start();
      setIsListening(true);
    }
  };

  const handleSpeakText = (text: string) => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    speakArabic(text, {
      pitch: 1.05,
      rate: 1.0,
      voiceGender: 'female',
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleSendPrompt = async (promptText?: string) => {
    const textToSend = (promptText || inputPrompt).trim();
    if (!textToSend || isSending) return;
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
        body: JSON.stringify({ messages: history }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.response !== 'string') {
        throw new Error(result.message || result.error?.message || `تعذّر تنفيذ الطلب (HTTP ${response.status}).`);
      }
      setConnectionStatus(`اتصال ناجح • ${result.model || 'Gemini'}`);
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
      {/* Header Bar */}
      <div className="card p-5 bg-gradient-to-l from-[var(--bg-card)] to-[var(--bg-elevated)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent-dim flex items-center justify-center glow-accent flex-shrink-0">
            <Bot className="w-6 h-6 text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-primary">المساعد الشخصي NADA AI</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold">
                {connectionStatus}
              </span>
            </div>
            <p className="text-xs text-muted">
              صوت عربي عند توفر إمكانات المتصفح • الردود تأتي عبر الخادم بعد نجاح الاتصال
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {speechError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-warning flex items-center justify-between">
          <span>{speechError}</span>
          <button onClick={() => setSpeechError(null)} className="font-bold px-2">
            ✕
          </button>
        </div>
      )}

      {/* Chat Messages Log */}
      <div className="card p-4 sm:p-6 min-h-[420px] max-h-[560px] overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white'
                  : 'bg-elevated border border-default text-accent'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
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
      <div className="flex flex-wrap gap-2 pt-1">
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendPrompt();
        }}
        className="card p-3 flex items-center gap-2"
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
