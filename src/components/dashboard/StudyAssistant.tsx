'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { IconSparkles, IconSend, IconLock } from '@tabler/icons-react';

type Msg = { role: 'user' | 'assistant'; content: string };

/** Replace the content of the last assistant message (the one being streamed). */
function withLastAssistant(msgs: Msg[], content: string): Msg[] {
  const idx = msgs.map((m) => m.role).lastIndexOf('assistant');
  if (idx < 0) return msgs;
  const copy = [...msgs];
  copy[idx] = { role: 'assistant', content };
  return copy;
}

export default function StudyAssistant({ locale, isPaid }: { locale: string; isPaid: boolean }) {
  const t = useTranslations('dashboard.assistant');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Free users see a locked upsell — the real gate is the 402 on /api/chat; this
  // is just the experience. Upgrade CTA matches the dashboard's existing path.
  if (!isPaid) {
    return (
      <section className="dash-block">
        <h2 className="dash-block-title">{t('title')}</h2>
        <div className="assistant-locked">
          <span className="assistant-locked-ico">
            <IconLock size={22} stroke={2} />
          </span>
          <div>
            <div className="assistant-locked-title">{t('lockedTitle')}</div>
            <p className="assistant-locked-body">{t('lockedBody')}</p>
          </div>
          <Link href={`/${locale}/learn/advanced`} className="btn-launch">
            {t('upgrade')}
          </Link>
        </div>
      </section>
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, messages: next }),
      });
      if (!res.ok || !res.body) {
        setMessages((m) => withLastAssistant(m, t('error')));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => withLastAssistant(m, acc));
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      }
    } catch {
      setMessages((m) => withLastAssistant(m, t('error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dash-block">
      <h2 className="dash-block-title">
        <IconSparkles size={18} stroke={2} /> {t('title')}
      </h2>
      <div className="assistant">
        <div className="assistant-log" ref={logRef}>
          {messages.length === 0 ? (
            <p className="assistant-intro">{t('intro')}</p>
          ) : (
            messages.map((m, i) => {
              const streaming = busy && i === messages.length - 1 && m.role === 'assistant' && !m.content;
              return (
                <div key={i} className={`assistant-msg ${m.role}`}>
                  {streaming ? <span className="assistant-typing">{t('thinking')}</span> : m.content}
                </div>
              );
            })
          )}
        </div>
        <form className="assistant-input" onSubmit={send}>
          <input
            className="assistant-field"
            value={input}
            placeholder={t('placeholder')}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            aria-label={t('placeholder')}
          />
          <button className="btn-launch assistant-send" type="submit" disabled={busy || !input.trim()} aria-label={t('send')}>
            <IconSend size={16} stroke={2} />
          </button>
        </form>
      </div>
    </section>
  );
}
