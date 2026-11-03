import {createHash} from 'crypto';
import {CactbotFetch} from '../../src/planner';

const API = 'https://api.github.com/repos/OverlayPlugin/cactbot';
const RAW = 'https://raw.githubusercontent.com/OverlayPlugin/cactbot';

const answer = (
  status: number,
  body = '',
  headers: Record<string, string> = {},
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: (name: string) => headers[name.toLowerCase()] ?? null},
  text: async () => body,
});

// Answers as GitHub does for cactbot's repository: its latest commit (with
// an ETag; 304 when asked with it), a folder's tree at a commit (each
// file's content hash), and a file's text at a commit. `failing` paths
// answer 500.
class FakeCactbot {
  commit = 'a'.repeat(40);
  files: Record<string, string> = {};
  failing = new Set<string>();
  requests: string[] = [];

  reset() {
    this.commit = 'a'.repeat(40);
    this.files = {};
    this.failing.clear();
    this.requests = [];
  }

  fetch: CactbotFetch = async (url, init) => {
    this.requests.push(url);
    if (url === `${API}/commits/main`) {
      const etag = `"${this.commit}"`;
      if (init?.headers?.['if-none-match'] === etag) return answer(304);
      return answer(200, JSON.stringify({sha: this.commit}), {etag});
    }
    const tree = new RegExp(
      `^${API}/git/trees/(\\w+):(.+)\\?recursive=1$`,
    ).exec(url);
    if (tree) {
      const folder = `${tree[2]}/`;
      const entries = Object.entries(this.files)
        .filter(([path]) => path.startsWith(folder))
        .map(([path, text]) => ({
          path: path.slice(folder.length),
          type: 'blob',
          sha: createHash('sha1').update(text).digest('hex'),
        }));
      return answer(200, JSON.stringify({tree: entries, truncated: false}));
    }
    const prefix = `${RAW}/${this.commit}/`;
    if (url.startsWith(prefix)) {
      const path = url.slice(prefix.length);
      if (this.failing.has(path)) return answer(500);
      const text = this.files[path];
      return text === undefined ? answer(404) : answer(200, text);
    }
    return answer(404);
  };
}

export {FakeCactbot};
