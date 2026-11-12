import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { NICK_MAX } from './protocol';
import { relayAvailable, savedNick, useShareStore } from './room';
import './share.css';

function People() {
  const { t } = useTranslation();
  const people = useShareStore((s) => s.people);
  if (people.length === 0) return null;
  return (
    <ul className="share__people">
      {people.map((p) => (
        <li key={p.clientId} className={p.role === 'host' ? 'share__person share__person--host' : 'share__person'}>
          {p.nick}
          {p.role === 'host' && <span className="share__tag">{t('share.hostTag')}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Saves page box: share this save with the farmhands, or join the host's room with a code and a nickname. */
export function SharePanel() {
  const { t } = useTranslation();
  const { status, role, code, peers, error, host, join, stop } = useShareStore();
  const hasSave = useSaveStore((s) => !!s.save && s.folder !== 'shared');
  const [input, setInput] = useState('');
  const [nick, setNick] = useState(savedNick);
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(code ?? '').then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  const submit = () => join(input, nick);

  return (
    <details className="home-fold box" open={role || error ? true : undefined}>
      <summary>{t('share.title')}</summary>
      <div className="share">
        {!relayAvailable() ? (
          <p className="saves__hint">{t('share.unavailable')}</p>
        ) : role === 'host' && status !== 'error' ? (
          <>
            <div className="share__row">
              <span>{t('share.yourCode')}</span>
              <code className="share__code inset">{code}</code>
              <button className="button" onClick={copy}>
                {copied ? t('saves.copied') : t('share.copy')}
              </button>
              <span className={status === 'hosting' ? 'share__status share__status--on' : 'share__status'}>
                {status === 'hosting' ? t('share.peers', { count: peers }) : t(`share.state.${status}`, { defaultValue: '' })}
              </span>
              <button className="button" onClick={stop}>
                {t('share.stop')}
              </button>
            </div>
            <People />
          </>
        ) : role === 'guest' && status !== 'error' ? (
          <>
            <div className="share__row">
              <span>{t('share.room', { code })}</span>
              <span className={status === 'joined' ? 'share__status share__status--on' : 'share__status'}>{t(`share.state.${status}`, { defaultValue: '' })}</span>
              <button className="button" onClick={stop}>
                {t('share.leave')}
              </button>
            </div>
            <People />
          </>
        ) : (
          <div className="share__options">
            {error && <p className="farm-warn">{t(`share.errors.${error}`)}</p>}
            <div className="share__row">
              <button className="button button--primary" onClick={host} disabled={!hasSave}>
                {t('share.host')}
              </button>
              {!hasSave && <span className="saves__hint">{t('share.needSave')}</span>}
            </div>
            <div className="share__row">
              <input
                className="shops__search share__input share__nick"
                placeholder={t('share.nickPlaceholder')}
                maxLength={NICK_MAX}
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                aria-label={t('share.nickPlaceholder')}
              />
              <input
                className="shops__search share__input"
                placeholder={t('share.codePlaceholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                aria-label={t('share.codePlaceholder')}
              />
              <button className="button" onClick={submit} disabled={!nick.trim() || !input.trim()}>
                {t('share.join')}
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

/** Top bar chip while sharing or watching the host's save. */
export function ShareChip() {
  const { t } = useTranslation();
  const { status, role, code, peers } = useShareStore();
  if (!role || status === 'error') return null;
  return (
    <span className="cached-chip box">
      <span className={status === 'hosting' || status === 'joined' ? 'share__dot share__dot--on' : 'share__dot'} aria-hidden="true" />
      {role === 'host' ? t('share.chipHost', { code, count: peers }) : t('share.chipGuest', { code })}
    </span>
  );
}
