// Which requests are live update WebSockets, and from where they may come.
// Kept apart from the hub so they can be tested without the Workers runtime.

import {URL} from 'url';

// The path clients open a WebSocket on.
const LIVE_PATH = '/api/live';

// A WebSocket request for the live updates.
function isLiveRequest(request: WorkerRequest) {
  return (
    new URL(request.url).pathname === LIVE_PATH &&
    request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
  );
}

// Browsers send the page's Origin with a WebSocket and no CORS check applies,
// so only the site's own pages (and the configured CORS origins) may connect.
function isAllowedOrigin(
  request: WorkerRequest,
  allowed: {baseUrl: string; corsOrigins: string[]}
) {
  const origin = request.headers.get('Origin');
  return (
    origin === null ||
    origin === new URL(allowed.baseUrl).origin ||
    allowed.corsOrigins.includes(origin)
  );
}

export {LIVE_PATH, isAllowedOrigin, isLiveRequest};
