import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { NICK_MAX } from './protocol';
import { relayAvailable, savedNick, useShareStore } from './room';
import './share.css';

/** Menu label key for each page path. */
const PAGE_KEYS: Record<string, string> = {
  '': 'home',
  player: 'player',
  calendar: 'calendar',
  relationships: 'relationships',
  map: 'map',
  quests: 'quests',
  shops: 'shops',
  farm: 'farmPlan',
  community: 'community',
  collections: 'collections',
};

/** Who's in the room and which tab each one is looking at; this tab first. */
export function People() {
  const { t } = useTranslation();
  const people = useShareStore((s) => s.people);
  const role = useShareStore((s) => s.role);
  const { kick, ban } = useShareStore.getState();
  if (people.length === 0) return null;
  const isHost = role === 'host';
  return (
    <ul className="share__people">
      {people.map((p, i) => {
        const key = PAGE_KEYS[(p.route ?? '/').split('/')[1] ?? ''];
        return (
          <li key={p.clientId} className="share__person">
            <span className="presence-dot" style={{ background: p.color ?? '#999' }} aria-hidden="true" />
            <span className="share__name">{p.nick}</span>
            {i === 0 && <span className="share__tag">{t('share.you')}</span>}
            {p.role === 'host' && <span className="share__tag">{t('share.hostTag')}</span>}
            {key && <span className="share__page">{t(`nav.${key}`)}</span>}
            {isHost && p.role === 'guest' && (
              <span className="share__actions">
                <button className="button button--small" onClick={() => kick(p.clientId)} title={t('share.kickHint')}>
                  {t('share.kick')}
                </button>
                <button className="button button--small" onClick={() => confirm(t('share.banConfirm', { nick: p.nick })) && ban(p.clientId)} title={t('share.banHint')}>
                  {t('share.ban')}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The host's room controls: lock, a new code, and the banned list. */
function HostControls() {
  const { t } = useTranslation();
  const locked = useShareStore((s) => s.locked);
  const bans = useShareStore((s) => s.bans);
  const { setLocked, newCode, unban } = useShareStore.getState();
  return (
    <div className="share__host-tools">
      <div className="share__row">
        <label className="share__toggle" title={t('share.lockHint')}>
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          {t('share.lock')}
        </label>
        <button className="button button--small" onClick={() => confirm(t('share.newCodeConfirm')) && newCode()} title={t('share.newCodeHint')}>
          {t('share.newCode')}
        </button>
      </div>
      {bans.length > 0 && (
        <div className="share__row share__bans">
          <span className="saves__hint">{t('share.banned')}</span>
          {bans.map((b) => (
            <span key={b.browser} className="share__person">
              {b.nick}
              <button className="button button--small" onClick={() => unban(b.browser)}>
                {t('share.unban')}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Saves page box: share this save with the farmhands, or join the host's room with a code and a nickname. */
export function SharePanel() {
  const { t } = useTranslation();
  const { status, role, code, peers, error, host, join, stop } = useShareStore();
  const hasSave = useSaveStore((s) => !!s.save && s.folder !== 'shared');
  // The last room this tab tried, so coming back (or being let back in) is one click.
  const [input, setInput] = useState(() => (useShareStore.getState().role === 'guest' ? useShareStore.getState().code ?? '' : ''));
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
            <HostControls />
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
  // Opens the list of who's here and on which tab.
  return (
    <details className="share-chip">
      <summary className="cached-chip box">
        <span className={status === 'hosting' || status === 'joined' ? 'share__dot share__dot--on' : 'share__dot'} aria-hidden="true" />
        {role === 'host' ? t('share.chipHost', { code, count: peers }) : t('share.chipGuest', { code })}
      </summary>
      <div className="share-chip__list box">
        <People />
      </div>
    </details>
  );
}
