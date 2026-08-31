'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { IconSparkles, IconSend, IconLock, IconThumbUp, IconThumbDown } from '@tabler/icons-react';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  /** Server-assigned id for this turn, from the X-Turn-Id response header. */
  turnId?: string;
  rating?: -1 | 1;
};

/** Patch the last assistant message (the one being streamed, or the one just rated). */
function patchLastAssistant(msgs: Msg[], patch: Partial<Msg>): Msg[] {
  const idx = msgs.map((m) => m.role).lastIndexOf('assistant');
  if (idx < 0) return msgs;
  const copy = [...msgs];
  copy[idx] = { ...copy[idx]!, ...patch };
  return copy;
}

export default function StudyAssistant({ locale, isPaid }: { locale: string; isPaid: boolean }) {
  const t = useTranslations('dashboard.assistant');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  // One id for the whole mounted conversation, so turns can be grouped back into a
  // session server-side. Only ever used for grouping — every row is scoped by the
  // session's userId, so a forged id can mislabel nothing but the forger's own turns.
  const conversationId = useRef<string>('');
  if (!conversationId.current) conversationId.current = crypto.randomUUID();

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

  async function rate(turnId: string, rating: -1 | 1) {
    // Optimistic: a rating that fails to save is not worth interrupting the
    // student over, and the row simply stays unrated.
    setMessages((m) => m.map((msg) => (msg.turnId === turnId ? { ...msg, rating } : msg)));
    try {
      await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId, rating }),
      });
    } catch {
      /* ignore — see above */
    }
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
        body: JSON.stringify({
          locale,
          conversationId: conversationId.current,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) {
        setMessages((m) => patchLastAssistant(m, { content: t('error') }));
        return;
      }
      const turnId = res.headers.get('X-Turn-Id') ?? undefined;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => patchLastAssistant(m, { content: acc, turnId }));
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      }
    } catch {
      setMessages((m) => patchLastAssistant(m, { content: t('error') }));
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
              const isLast = i === messages.length - 1;
              const streaming = busy && isLast && m.role === 'assistant' && !m.content;
              // Rating is offered once the turn is finished and the server has told
              // us which turn it was. This is the only human signal in the system —
              // everything else the assistant records is its own opinion of itself.
              const canRate = m.role === 'assistant' && !!m.turnId && !!m.content && !(busy && isLast);
              return (
                <div key={i} className={`assistant-turn ${m.role}`}>
                  <div className={`assistant-msg ${m.role}`}>
                    {streaming ? <span className="assistant-typing">{t('thinking')}</span> : m.content}
                  </div>
                  {canRate && (
                    <div className="assistant-feedback">
                      {m.rating ? (
                        <span className="assistant-feedback-thanks">{t('thanks')}</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="assistant-rate"
                            onClick={() => rate(m.turnId!, 1)}
                            aria-label={t('helpful')}
                            title={t('helpful')}
                          >
                            <IconThumbUp size={15} stroke={2} />
                          </button>
                          <button
                            type="button"
                            className="assistant-rate"
                            onClick={() => rate(m.turnId!, -1)}
                            aria-label={t('notHelpful')}
                            title={t('notHelpful')}
                          >
                            <IconThumbDown size={15} stroke={2} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
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
