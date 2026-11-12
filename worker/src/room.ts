import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE_HOST_LEFT,
  CLOSE_REFUSED,
  CLOSE_REPLACED,
  decodeChunk,
  HOST_GRACE_MS,
  PING,
  PONG,
  type Checks,
  type Peer,
  type ServerMessage,
} from '../../src/features/share/protocol';
import { accept, admit, applyCheck, ROOM_TTL_MS } from '../../src/features/share/roomRules';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
}

interface SaveMeta {
  version: number;
  total: number;
}

/** Who a socket is, kept on the socket itself so it survives hibernation. */
type Attached = Peer & { replaced?: boolean };

const NO_CHECKS: Checks = { day: null, checked: {} };
const publicPeer = ({ clientId, nick, role, route }: Attached): Peer => ({ clientId, nick, role, route });

/**
 * One multiplayer room. Uses the WebSocket Hibernation API: while nobody sends anything the room sleeps
 * (and costs nothing), and pings are answered without waking it. Who each socket is lives in its
 * attachment; the save, the Today list and the app status live in the room's storage, so late joiners
 * and reconnects get them. The room exists while its host is there: when the host stops sharing, or
 * drops and doesn't come back within HOST_GRACE_MS, the farmhands are sent away.
 */
export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  private sockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  private peerOf(ws: WebSocket): Attached | null {
    return (ws.deserializeAttachment() as Attached | null) ?? null;
  }

  private live(except?: WebSocket) {
    return this.sockets(except)
      .map((ws) => ({ ws, peer: this.peerOf(ws) }))
      .filter((e): e is { ws: WebSocket; peer: Attached } => !!e.peer && !e.peer.replaced);
  }

  private send(ws: WebSocket, message: ServerMessage | ArrayBuffer) {
    try {
      ws.send(message instanceof ArrayBuffer ? message : JSON.stringify(message));
    } catch {
      // Already closing.
    }
  }

  private broadcast(message: ServerMessage | ArrayBuffer, filter: (peer: Attached) => boolean, except?: WebSocket) {
    const body = message instanceof ArrayBuffer ? message : JSON.stringify(message);
    for (const { ws, peer } of this.live(except)) {
      if (!filter(peer)) continue;
      try {
        ws.send(body);
      } catch {
        // Already closing.
      }
    }
  }

  /** The host is gone for good: send everyone away and forget what was shared (the code stays the host's). */
  private async closeRoom() {
    for (const { ws, peer } of this.live()) {
      if (peer.role !== 'guest') continue;
      ws.serializeAttachment({ ...peer, replaced: true });
      ws.close(CLOSE_HOST_LEFT, 'host-left');
    }
    const meta = await this.ctx.storage.get<SaveMeta>('save');
    const keys = ['save', 'checks', 'app', 'hostGoneAt', ...Array.from({ length: meta?.total ?? 0 }, (_, i) => `chunk:${i}`)];
    await this.ctx.storage.delete(keys);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = (await this.ctx.storage.get<string>('token')) ?? null;
    const hostGoneAt = (await this.ctx.storage.get<number>('hostGoneAt')) ?? null;
    const present = this.live();
    const hostPresent = present.some((e) => e.peer.role === 'host') || (hostGoneAt !== null && Date.now() - hostGoneAt < HOST_GRACE_MS);
    const admission = admit(
      { role: url.searchParams.get('role'), clientId: url.searchParams.get('clientId'), nick: url.searchParams.get('nick'), token: url.searchParams.get('token') },
      { token, peers: present.map((e) => e.peer), hostPresent },
    );

    const [client, server] = Object.values(new WebSocketPair());
    if ('refuse' in admission) {
      // Accepted only to tell the browser why: a failed upgrade carries no reason.
      server.accept();
      server.close(CLOSE_REFUSED, admission.refuse);
      return new Response(null, { status: 101, webSocket: client });
    }

    const { peer, claim } = admission;
    if (claim) await this.ctx.storage.put('token', url.searchParams.get('token'));
    if (peer.role === 'host') {
      // Back in time: the room stays open.
      await this.ctx.storage.delete('hostGoneAt');
      await this.ctx.storage.deleteAlarm();
    } else if (hostGoneAt === null) {
      // Someone's here: the room isn't forgotten (a host grace timer, if any, keeps running).
      await this.ctx.storage.deleteAlarm();
    }

    // The same browser reconnecting, or the host opening the room in another tab, replaces the old connection.
    for (const { ws, peer: other } of present) {
      if (other.clientId === peer.clientId || (peer.role === 'host' && other.role === 'host')) {
        ws.serializeAttachment({ ...other, replaced: true });
        ws.close(CLOSE_REPLACED, 'replaced');
      }
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(peer);

    const others = this.live(server).map((e) => publicPeer(e.peer));
    const checks = (await this.ctx.storage.get<Checks>('checks')) ?? NO_CHECKS;
    const app = (await this.ctx.storage.get<boolean>('app')) ?? false;
    const hostOnline = peer.role === 'host' || others.some((p) => p.role === 'host');
    this.send(server, { type: 'welcome', you: peer, peers: others, hostOnline, checks, app: hostOnline && app });

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
    if (!peer || peer.replaced) return;

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
    switch (m.type) {
      case 'cur':
        // Only to the people on the same page; never stored.
        if (peer.route) this.broadcast({ ...m, clientId: peer.clientId }, (p) => p.route === peer.route, ws);
        return;
      case 'route':
        ws.serializeAttachment({ ...peer, route: m.route });
        this.broadcast({ type: 'route', clientId: peer.clientId, route: m.route }, () => true, ws);
        return;
      case 'check': {
        const checks = (await this.ctx.storage.get<Checks>('checks')) ?? NO_CHECKS;
        const next = applyCheck(checks, m.day, m.key, m.on);
        if (!next) return;
        await this.ctx.storage.put('checks', next);
        this.broadcast(m, () => true, ws);
        return;
      }
      case 'checks':
        await this.ctx.storage.put('checks', { day: m.day, checked: m.checked });
        this.broadcast(m, (p) => p.role === 'guest', ws);
        return;
      case 'app':
        await this.ctx.storage.put('app', m.live);
        this.broadcast(m, (p) => p.role === 'guest', ws);
        return;
      case 'close':
        // "Stop sharing": the room closes for everyone right away.
        ws.serializeAttachment({ ...peer, replaced: true });
        await this.closeRoom();
        ws.close(1000, 'closed');
        await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
        return;
    }
  }

  private async gone(ws: WebSocket) {
    const peer = this.peerOf(ws);
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed.
    }
    const rest = this.live(ws);
    if (peer && !peer.replaced) {
      this.broadcast({ type: 'peer', peer: publicPeer(peer), online: false }, () => true, ws);
      if (peer.role === 'host' && !rest.some((e) => e.peer.role === 'host')) {
        await this.ctx.storage.put('app', false);
        this.broadcast({ type: 'host', online: false }, (p) => p.role === 'guest', ws);
        if (rest.length > 0) {
          // Maybe just a reload: the farmhands wait a little before the room closes.
          await this.ctx.storage.put('hostGoneAt', Date.now());
          await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
          return;
        }
      }
    }
    // Nobody left: the room is forgotten in a day unless the host comes back.
    if (rest.length === 0 && (await this.ctx.storage.get('hostGoneAt')) === undefined) await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async webSocketClose(ws: WebSocket) {
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.gone(ws);
  }

  async alarm() {
    const hostGoneAt = await this.ctx.storage.get<number>('hostGoneAt');
    if (hostGoneAt !== undefined) {
      if (this.live().some((e) => e.peer.role === 'host')) return;
      // The host didn't come back.
      await this.closeRoom();
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return;
    }
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.deleteAll();
  }
}
