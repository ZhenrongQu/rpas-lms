'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  IconSparkles,
  IconSend,
  IconLock,
  IconThumbUp,
  IconThumbDown,
  IconPlus,
} from '@tabler/icons-react';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  /** Server-assigned id for this turn, from the X-Turn-Id response header. */
  turnId?: string;
  rating?: -1 | 1;
};

/** Matches the route's zod cap. Trimming here rather than letting the server
 *  reject keeps a long-running restored conversation usable. */
const MAX_TRANSCRIPT = 40;

/** Keep the newest messages, but never open on an assistant turn — the model API
 *  rejects a transcript that does, and slicing a tail can easily produce one. */
function trimTranscript(msgs: Msg[]): Msg[] {
  const tail = msgs.slice(-MAX_TRANSCRIPT);
  const firstUser = tail.findIndex((m) => m.role === 'user');
  return firstUser <= 0 ? tail : tail.slice(firstUser);
}

/** Patch the last assistant message (the one being streamed, or the one just rated). */
function patchLastAssistant(msgs: Msg[], patch: Partial<Msg>): Msg[] {
  const idx = msgs.map((m) => m.role).lastIndexOf('assistant');
  if (idx < 0) return msgs;
  const copy = [...msgs];
  copy[idx] = { ...copy[idx]!, ...patch };
  return copy;
}

export default function StudyAssistant({
  locale,
  isPaid,
  userId,
}: {
  locale: string;
  isPaid: boolean;
  userId: string;
}) {
  const t = useTranslations('dashboard.assistant');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Nothing is written back until the saved conversation has been read, so the
  // empty first render cannot overwrite it.
  const [hydrated, setHydrated] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const conversationId = useRef<string>('');

  // Keyed by user: one browser can be shared, and a restored conversation must
  // never surface to whoever logs in next.
  const storageKey = `rpas.assistant.${userId}`;

  // Restore. In an effect, not a state initialiser — localStorage does not exist
  // during the server render, and reading it inline would mismatch on hydration.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { conversationId?: string; messages?: Msg[] };
        if (Array.isArray(saved.messages)) setMessages(trimTranscript(saved.messages));
        if (saved.conversationId) conversationId.current = saved.conversationId;
      }
    } catch {
      // Private mode, cleared site data, corrupt JSON — start fresh rather than fail.
    }
    if (!conversationId.current) conversationId.current = crypto.randomUUID();
    setHydrated(true);
  }, [storageKey]);

  // Persist. This is what makes a refresh stop ending the conversation — which is
  // also what lets the prompt cache pay for itself: production showed cache_read
  // rising 1210 → 4701 across a multi-turn conversation, and every single-turn one
  // writes a cache entry nothing ever reads.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ conversationId: conversationId.current, messages: trimTranscript(messages) }),
      );
    } catch {
      // Quota or disabled storage. The conversation still works for this page view.
    }
  }, [messages, hydrated, storageKey]);

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

  function newConversation() {
    if (busy) return;
    conversationId.current = crypto.randomUUID();
    setMessages([]);
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

    const next = trimTranscript([...messages, { role: 'user', content: text }]);
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
        {messages.length > 0 && (
          <button type="button" className="assistant-new" onClick={newConversation} disabled={busy} title={t('newChat')}>
            <IconPlus size={14} stroke={2} /> {t('newChat')}
          </button>
        )}
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
                    {m.role === 'user' || streaming ? (
                      streaming ? <span className="assistant-typing">{t('thinking')}</span> : m.content
                    ) : (
                      // The model answers in markdown — headings, bold, bullets and
                      // GFM tables all appeared in the first four production turns —
                      // and this was rendering it as plain text, so students read
                      // literal "##" and raw "|---|" table pipes. No raw HTML is
                      // enabled, so model output cannot inject markup.
                      <div className="assistant-md">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                            table: ({ ...props }) => (
                              <div className="assistant-md-table">
                                <table {...props} />
                              </div>
                            ),
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
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
