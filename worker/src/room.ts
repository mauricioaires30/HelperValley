import { DurableObject } from 'cloudflare:workers';
import { decodeChunk, PING, PONG, type Checks, type Peer, type ServerMessage } from '../../src/features/share/protocol';
import { accept, admit, applyCheck, ROOM_TTL_MS } from '../../src/features/share/roomRules';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
}

interface SaveMeta {
  version: number;
  total: number;
}

const NO_CHECKS: Checks = { day: null, checked: {} };

/**
 * One multiplayer room. Uses the WebSocket Hibernation API: while nobody sends anything the room sleeps
 * (and costs nothing), and pings are answered without waking it. Who each socket is lives in its
 * attachment; the save, the Today list and the app status live in the room's storage, so late joiners
 * and reconnects get them.
 */
export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  private sockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  private peerOf(ws: WebSocket): Peer | null {
    return (ws.deserializeAttachment() as Peer | null) ?? null;
  }

  private send(ws: WebSocket, message: ServerMessage | ArrayBuffer) {
    try {
      ws.send(message instanceof ArrayBuffer ? message : JSON.stringify(message));
    } catch {
      // Already closing.
    }
  }

  private broadcast(message: ServerMessage | ArrayBuffer, filter: (peer: Peer) => boolean, except?: WebSocket) {
    for (const ws of this.sockets(except)) {
      const peer = this.peerOf(ws);
      if (peer && filter(peer)) this.send(ws, message);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = (await this.ctx.storage.get<string>('token')) ?? null;
    const peers = this.sockets()
      .map((ws) => this.peerOf(ws))
      .filter((p): p is Peer => !!p);
    const admission = admit(
      { role: url.searchParams.get('role'), clientId: url.searchParams.get('clientId'), nick: url.searchParams.get('nick'), token: url.searchParams.get('token') },
      { token, peers },
    );

    const [client, server] = Object.values(new WebSocketPair());
    if ('refuse' in admission) {
      // Accepted only to tell the browser why: a failed upgrade carries no reason.
      server.accept();
      server.close(4000, admission.refuse);
      return new Response(null, { status: 101, webSocket: client });
    }

    const { peer, claim } = admission;
    if (claim) await this.ctx.storage.put('token', url.searchParams.get('token'));
    await this.ctx.storage.deleteAlarm();

    // The same browser reconnecting, or the host opening the room in another tab, replaces the old connection.
    for (const ws of this.sockets()) {
      const other = this.peerOf(ws);
      if (other && (other.clientId === peer.clientId || (peer.role === 'host' && other.role === 'host'))) {
        ws.serializeAttachment({ ...other, replaced: true });
        ws.close(4001, 'replaced');
      }
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(peer);

    const others = this.sockets(server)
      .map((ws) => this.peerOf(ws))
      .filter((p): p is Peer & { replaced?: boolean } => !!p && !(p as { replaced?: boolean }).replaced);
    const checks = (await this.ctx.storage.get<Checks>('checks')) ?? NO_CHECKS;
    const app = (await this.ctx.storage.get<boolean>('app')) ?? false;
    const hostOnline = peer.role === 'host' || others.some((p) => p.role === 'host');
    this.send(server, { type: 'welcome', you: peer, peers: others.map(({ clientId, nick, role }) => ({ clientId, nick, role })), hostOnline, checks, app: hostOnline && app });

    if (peer.role === 'guest') {
      // The last save the host sent, for whoever joins late.
      const meta = await this.ctx.storage.get<SaveMeta>('save');
      if (meta) {
        const parts = await this.ctx.storage.get<ArrayBuffer>(Array.from({ length: meta.total }, (_, i) => `chunk:${i}`));
        for (let i = 0; i < meta.total; i++) {
          const part = parts.get(`chunk:${i}`);
          if (part) this.send(server, part);
        }
      }
    }

    this.broadcast({ type: 'peer', peer, online: true }, () => true, server);
    if (peer.role === 'host') this.broadcast({ type: 'host', online: true }, (p) => p.role === 'guest', server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const peer = this.peerOf(ws);
    if (!peer) return;

    if (message instanceof ArrayBuffer) {
      if (peer.role !== 'host') return;
      const chunk = decodeChunk(message);
      if (!chunk) return;
      const meta = await this.ctx.storage.get<SaveMeta>('save');
      if (meta && chunk.version < meta.version) return;
      if (!meta || chunk.version > meta.version) {
        // A new save: forget the pieces the old one had beyond this one's count.
        if (meta && meta.total > chunk.total) {
          await this.ctx.storage.delete(Array.from({ length: meta.total - chunk.total }, (_, i) => `chunk:${chunk.total + i}`));
        }
        await this.ctx.storage.put('save', { version: chunk.version, total: chunk.total });
      }
      await this.ctx.storage.put(`chunk:${chunk.index}`, message);
      this.broadcast(message, (p) => p.role === 'guest', ws);
      return;
    }

    const m = accept(peer.role, message);
    if (!m) return;
    if (m.type === 'check') {
      const checks = (await this.ctx.storage.get<Checks>('checks')) ?? NO_CHECKS;
      const next = applyCheck(checks, m.day, m.key, m.on);
      if (!next) return;
      await this.ctx.storage.put('checks', next);
      this.broadcast(m, () => true, ws);
    } else if (m.type === 'checks') {
      await this.ctx.storage.put('checks', { day: m.day, checked: m.checked });
      this.broadcast(m, (p) => p.role === 'guest', ws);
    } else if (m.type === 'app') {
      await this.ctx.storage.put('app', m.live);
      this.broadcast(m, (p) => p.role === 'guest', ws);
    }
  }

  private async gone(ws: WebSocket) {
    const peer = this.peerOf(ws) as (Peer & { replaced?: boolean }) | null;
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed.
    }
    const rest = this.sockets(ws);
    if (peer && !peer.replaced) {
      this.broadcast({ type: 'peer', peer: { clientId: peer.clientId, nick: peer.nick, role: peer.role }, online: false }, () => true, ws);
      if (peer.role === 'host' && !rest.some((s) => this.peerOf(s)?.role === 'host')) {
        await this.ctx.storage.put('app', false);
        this.broadcast({ type: 'host', online: false }, (p) => p.role === 'guest', ws);
      }
    }
    // Nobody left: the room is forgotten in a day unless someone comes back.
    if (rest.length === 0) await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async webSocketClose(ws: WebSocket) {
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.gone(ws);
  }

  async alarm() {
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.deleteAll();
  }
}
