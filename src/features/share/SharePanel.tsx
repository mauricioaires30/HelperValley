import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { useShareStore } from './liveShare';
import './share.css';

/** Saves page box: share this save with the farmhands, or join the host's room with a code. */
export function SharePanel() {
  const { t } = useTranslation();
  const { status, role, code, peers, host, join, stop } = useShareStore();
  const hasSave = useSaveStore((s) => !!s.save && s.folder !== 'shared');
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(code ?? '').then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });

  return (
    <section className="share box">
      <h3>{t('share.title')}</h3>
      {role === 'host' ? (
        <div className="share__row">
          <span>{t('share.yourCode')}</span>
          <code className="share__code inset">{code}</code>
          <button className="button" onClick={copy}>
            {copied ? t('saves.copied') : t('share.copy')}
          </button>
          <span className={status === 'hosting' ? 'share__status share__status--on' : 'share__status'}>
            {status === 'hosting' ? t('share.peers', { count: peers }) : status === 'error' ? t('share.error') : t('share.starting')}
          </span>
          <button className="button" onClick={stop}>
            {t('share.stop')}
          </button>
        </div>
      ) : role === 'guest' ? (
        <div className="share__row">
          <span>{t('share.room', { code })}</span>
          <span className={status === 'joined' ? 'share__status share__status--on' : 'share__status'}>{t(`share.guest.${status}`, { defaultValue: '' })}</span>
          <button className="button" onClick={stop}>
            {t('share.leave')}
          </button>
        </div>
      ) : (
        <div className="share__options">
          <div className="share__row">
            <button className="button button--primary" onClick={host} disabled={!hasSave}>
              {t('share.host')}
            </button>
            <span className="saves__hint">{hasSave ? t('share.hostHint') : t('share.needSave')}</span>
          </div>
          <div className="share__row">
            <input className="shops__search share__input" placeholder={t('share.codePlaceholder')} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && join(input)} />
            <button className="button" onClick={() => join(input)}>
              {t('share.join')}
            </button>
            {status === 'error' && <span className="farm-warn">{t('share.badCode')}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

/** Top bar chip while sharing or watching the host's save. */
export function ShareChip() {
  const { t } = useTranslation();
  const { status, role, code, peers } = useShareStore();
  if (!role) return null;
  return (
    <span className="cached-chip box">
      <span className={status === 'hosting' || status === 'joined' ? 'share__dot share__dot--on' : 'share__dot'} aria-hidden="true" />
      {role === 'host' ? t('share.chipHost', { code, count: peers }) : t('share.chipGuest', { code })}
    </span>
  );
}
