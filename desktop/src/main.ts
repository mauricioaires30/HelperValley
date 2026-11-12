import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface Status {
  enabled: boolean;
  quitOnClose: boolean;
  state: 'ok' | 'paused' | 'source-missing' | 'error';
  message: string | null;
  lastCopyAt: number | null;
  saves: number;
  sources: string[];
  mirror: string;
  version: string;
}

const pt = !navigator.language.toLowerCase().startsWith('en');
const T = pt
  ? {
      version: (v: string) => `Versão ${v}`,
      ok: (n: number) => (n === 1 ? 'Copiando 1 save' : `Copiando ${n} saves`),
      off: 'Cópia desligada',
      missing: 'Pasta de saves do jogo não encontrada',
      missingDetail: 'Abra o Stardew Valley e salve pelo menos uma vez. Procurando em:',
      error: 'Algo deu errado ao copiar',
      detail: (mirror: string) => `O site lê a cópia em ${mirror}. Seus saves originais nunca são alterados.`,
      last: (when: string) => `Última cópia: ${when}`,
      never: 'Nenhuma cópia nova desde que o app abriu.',
      enabled: 'Copiar saves automaticamente',
      quitOnClose: 'Encerrar o app ao fechar a janela',
      open: 'Abrir pasta da cópia',
      trayKeep: 'Fechar a janela deixa o app rodando no canto da barra de tarefas (ícone da galinha). Para encerrar: botão direito no ícone → "Sair".',
      trayQuit: 'Fechar a janela encerra o app, e o site deixa de atualizar ao vivo.',
      pausedDeletes: 'A pasta do jogo está vazia: nada foi apagado da cópia.',
      deletesBlocked: 'A pasta da cópia tem arquivos que não são do app: ela recebe cópias, mas nada é apagado dela.',
      duplicates: (names: string) => `Save com o mesmo nome em duas pastas do jogo: ${names}. Usando o primeiro.`,
      updateText: (v: string) => `Nova versão disponível: ${v}`,
      updateButton: 'Atualizar agora',
      updating: 'Baixando a atualização…',
      updateFailed: 'Não deu para atualizar. Tente de novo mais tarde.',
    }
  : {
      version: (v: string) => `Version ${v}`,
      ok: (n: number) => (n === 1 ? 'Copying 1 save' : `Copying ${n} saves`),
      off: 'Copying is off',
      missing: "The game's save folder wasn't found",
      missingDetail: 'Open Stardew Valley and save at least once. Looking in:',
      error: 'Something went wrong while copying',
      detail: (mirror: string) => `The site reads the copy in ${mirror}. Your original saves are never changed.`,
      last: (when: string) => `Last copy: ${when}`,
      never: 'No new copy since the app opened.',
      enabled: 'Copy saves automatically',
      quitOnClose: 'Quit the app when the window closes',
      open: 'Open the copy folder',
      trayKeep: 'Closing the window keeps the app running in the corner of the taskbar (chicken icon). To quit: right-click the icon → "Quit".',
      trayQuit: 'Closing the window quits the app, and the site stops updating live.',
      pausedDeletes: "The game's folder is empty: nothing was deleted from the copy.",
      deletesBlocked: "The copy folder has files that aren't the app's: it gets copies, but nothing is deleted from it.",
      duplicates: (names: string) => `A save with the same name in two game folders: ${names}. Using the first one.`,
      updateText: (v: string) => `New version available: ${v}`,
      updateButton: 'Update now',
      updating: 'Downloading the update…',
      updateFailed: "Couldn't update. Try again later.",
    };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function render(s: Status) {
  $('version').textContent = T.version(s.version);
  const off = !s.enabled;
  $('state').textContent = off ? T.off : s.state === 'source-missing' ? T.missing : s.state === 'error' ? T.error : T.ok(s.saves);
  $('dot').className = `dot ${off ? 'dot--off' : s.state === 'ok' ? 'dot--on' : 'dot--warn'}`;
  const notes: string[] = [];
  if (s.state === 'source-missing') notes.push(`${T.missingDetail} ${s.sources.join(' · ')}`);
  else notes.push(T.detail(s.mirror));
  if (s.message === 'paused-deletes') notes.push(T.pausedDeletes);
  else if (s.message === 'deletes-blocked') notes.push(T.deletesBlocked);
  else if (s.message?.startsWith('duplicates:')) notes.push(T.duplicates(s.message.slice('duplicates:'.length)));
  else if (s.state === 'error' && s.message) notes.push(s.message);
  $('detail').textContent = notes.join(' ');
  $('last').textContent = s.lastCopyAt ? T.last(new Date(s.lastCopyAt).toLocaleString()) : T.never;
  $<HTMLInputElement>('enabled').checked = s.enabled;
  $<HTMLInputElement>('quit-on-close').checked = s.quitOnClose;
  $('tray').textContent = s.quitOnClose ? T.trayQuit : T.trayKeep;
}

async function refresh() {
  render(await invoke<Status>('get_status'));
}

async function checkUpdate() {
  let update: Update | null = null;
  try {
    update = await check();
  } catch {
    return; // Offline, or no release yet.
  }
  if (!update) return;
  const found = update;
  $('update').hidden = false;
  $('update-text').textContent = T.updateText(found.version);
  const button = $<HTMLButtonElement>('update-button');
  button.textContent = T.updateButton;
  button.onclick = async () => {
    button.disabled = true;
    $('update-text').textContent = T.updating;
    try {
      await found.downloadAndInstall();
      await relaunch();
    } catch {
      $('update-text').textContent = T.updateFailed;
      button.disabled = false;
    }
  };
}

$<HTMLInputElement>('enabled').onchange = (e) => void invoke('set_enabled', { enabled: (e.target as HTMLInputElement).checked });
$<HTMLInputElement>('quit-on-close').onchange = (e) => void invoke('set_quit_on_close', { quit: (e.target as HTMLInputElement).checked });
$('enabled-label').textContent = T.enabled;
$('quit-on-close-label').textContent = T.quitOnClose;
$('open').textContent = T.open;
$('open').onclick = () => void invoke('open_mirror');

void listen<Status>('status', (event) => render(event.payload));
void refresh();
void checkUpdate();
