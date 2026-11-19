import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, RotateCcw } from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';
import { apiUrl } from '../utils/backendUrl';

interface ChatMessage {
  role: 'user' | 'model';
  textKey?: 'coach.welcome' | 'coach.cleared';
  text?: string;
}

export function GeminiChessCoach() {
  const { t } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      textKey: 'coach.welcome',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    t('coach.suggestion1'),
    t('coach.suggestion2'),
    t('coach.suggestion3'),
    t('coach.suggestion4'),
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (textOverride?: string) => {
    const query = (textOverride ?? input).trim();
    if (!query || loading) return;

    const nextHistory = [...messages, { role: 'user' as const, text: query }];
    setMessages(nextHistory);
    if (!textOverride) setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/gemini/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: nextHistory.slice(-10).map((m) => ({
            role: m.role,
            text: m.textKey ? t(m.textKey) : m.text || '',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not reach Chess Coach.');
      }
      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-[#12171E] border border-slate-800 rounded-xl flex flex-col h-[470px] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/src/assets/images/gm_coach_emblem_1795034539937.jpg"
            alt={t('coach.title')}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
          />
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold text-slate-100 truncate">
              {t('coach.title')}
            </h3>
            <p className="text-xs text-slate-400 truncate">
              {t('coach.subtitle')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessages([
              {
                role: 'model',
                textKey: 'coach.cleared',
              },
            ]);
            setError(null);
          }}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          title={t('coach.resetTooltip')}
          aria-label={t('coach.resetTooltip')}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#19202A] text-slate-200 border border-slate-800'
              }`}
            >
              {m.textKey ? t(m.textKey) : m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#19202A] border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-300 inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              {t('coach.calculating')}
            </div>
          </div>
        )}
        {error && (
          <div className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 2 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-[#18202A] hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors text-start"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('coach.placeholder')}
          className="flex-1 bg-[#0B0E11] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium inline-flex items-center gap-1.5 transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
          {t('coach.ask')}
        </button>
      </form>
    </section>
  );
}
