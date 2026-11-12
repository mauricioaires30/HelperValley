import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface Legacy {
  link: string | null;
  target: string | null;
  backupJob: boolean;
  leftovers: string[];
}

interface Status {
  enabled: boolean;
  state: 'ok' | 'paused' | 'source-missing' | 'error';
  message: string | null;
  lastCopyAt: number | null;
  saves: number;
  sources: string[];
  mirror: string;
  legacy: Legacy | null;
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
      open: 'Abrir pasta da cópia',
      tray: 'Fechar esta janela mantém o app no canto da barra de tarefas. Para encerrar, clique com o botão direito no ícone da galinha e escolha "Sair".',
      pausedDeletes: 'A pasta do jogo está vazia: nada foi apagado da cópia.',
      deletesBlocked: 'A pasta da cópia tem arquivos que não são do app: ela recebe cópias, mas nada é apagado dela.',
      duplicates: (names: string) => `Save com o mesmo nome em duas pastas do jogo: ${names}. Usando o primeiro.`,
      updateText: (v: string) => `Nova versão disponível: ${v}`,
      updateButton: 'Atualizar agora',
      updating: 'Baixando a atualização…',
      legacyTitle: 'Configuração antiga encontrada',
      legacyText: (l: Legacy) =>
        `Os comandos antigos do site ${l.link ? `transformaram a pasta de saves do jogo num atalho para ${l.target}` : 'deixaram uma tarefa de backup ativa'}. O app pode desfazer isso com segurança: ele para o backup antigo${l.link ? ', remove só o atalho e devolve seus saves para a pasta do jogo' : ''}. Nada é apagado. Feche o jogo antes.`,
      legacyButton: 'Desfazer com segurança',
      legacyConfirm: 'Desfazer a configuração antiga agora? Feche o Stardew Valley antes. Nada será apagado.',
      legacyDone: 'Pronto. Seus saves estão de novo na pasta do jogo.',
      legacyGame: 'Feche o Stardew Valley e tente de novo.',
      leftovers: 'Pastas antigas que você pode apagar quando quiser (o app não apaga):',
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
      open: 'Open the copy folder',
      tray: 'Closing this window keeps the app in the corner of the taskbar. To end it, right-click the chicken icon and choose "Quit".',
      pausedDeletes: "The game's folder is empty: nothing was deleted from the copy.",
      deletesBlocked: "The copy folder has files that aren't the app's: it gets copies, but nothing is deleted from it.",
      duplicates: (names: string) => `A save with the same name in two game folders: ${names}. Using the first one.`,
      updateText: (v: string) => `New version available: ${v}`,
      updateButton: 'Update now',
      updating: 'Downloading the update…',
      legacyTitle: 'Old setup found',
      legacyText: (l: Legacy) =>
        `The site's old commands ${l.link ? `turned the game's save folder into a link to ${l.target}` : 'left a backup task running'}. The app can undo this safely: it stops the old backup${l.link ? ', removes only the link and puts your saves back in the game folder' : ''}. Nothing is deleted. Close the game first.`,
      legacyButton: 'Undo safely',
      legacyConfirm: 'Undo the old setup now? Close Stardew Valley first. Nothing will be deleted.',
      legacyDone: 'Done. Your saves are back in the game folder.',
      legacyGame: 'Close Stardew Valley and try again.',
      leftovers: "Old folders you can delete whenever you want (the app doesn't delete them):",
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

  const legacy = s.legacy;
  $('legacy').hidden = !legacy;
  if (legacy) {
    const found = legacy.link !== null || legacy.backupJob;
    $('legacy-title').textContent = T.legacyTitle;
    $('legacy-text').textContent = found ? T.legacyText(legacy) : '';
    $('legacy-button').hidden = !found;
    const list = $('legacy-leftovers');
    list.replaceChildren();
    if (legacy.leftovers.length) {
      const intro = document.createElement('li');
      intro.className = 'hint';
      intro.textContent = T.leftovers;
      list.append(intro);
      for (const folder of legacy.leftovers) {
        const item = document.createElement('li');
        const link = document.createElement('button');
        link.className = 'link';
        link.textContent = folder;
        link.onclick = () => void invoke('open_path_cmd', { path: folder });
        item.append(link);
        list.append(item);
      }
    }
  }
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
  const box = $('update');
  box.hidden = false;
  $('update-text').textContent = T.updateText(update.version);
  const button = $<HTMLButtonElement>('update-button');
  button.textContent = T.updateButton;
  button.onclick = async () => {
    button.disabled = true;
    $('update-text').textContent = T.updating;
    await update!.downloadAndInstall();
    await relaunch();
  };
}

$<HTMLInputElement>('enabled').onchange = (e) => void invoke('set_enabled', { enabled: (e.target as HTMLInputElement).checked });
$('enabled-label').textContent = T.enabled;
$('open').textContent = T.open;
$('open').onclick = () => void invoke('open_mirror');
$('tray').textContent = T.tray;
$('legacy-button').textContent = T.legacyButton;
$('legacy-button').onclick = async () => {
  if (!confirm(T.legacyConfirm)) return;
  try {
    await invoke<string[]>('undo_legacy');
    $('legacy-result').textContent = T.legacyDone;
  } catch (e) {
    $('legacy-result').textContent = String(e).includes('game-running') ? T.legacyGame : String(e);
  }
  await refresh();
};

void listen<Status>('status', (event) => render(event.payload));
void refresh();
void checkUpdate();
