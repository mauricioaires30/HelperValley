import { originAllowed } from '../../src/features/share/roomRules';
import type { Env } from './room';

export { Room } from './room';

/** HelperValley's multiplayer relay: GET /rooms/ABC-123/ws opens that room's WebSocket. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('HelperValley relay\n');
    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{3}-[A-Z0-9]{3})\/ws$/);
    if (!match) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (!originAllowed(request.headers.get('Origin'), allowed)) return new Response('Origin not allowed', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
} satisfies ExportedHandler<Env>;
