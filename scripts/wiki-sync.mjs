// Copies this repository's technical docs (docs/*.md and docs/features/*.md)
// into its GitHub wiki, as plain wiki pages: the wiki is a read-only copy,
// written again on every merge to main (.github/workflows/wiki.yaml); edit
// docs/ instead. The site guide (docs/_guide) isn't copied: it's not
// technical, and lives at everise.dev/guide/. The same script is in both
// repositories (the docs-site skill).
//
// Usage: node scripts/wiki-sync.mjs <docs folder> <wiki checkout> <owner/repo>
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {join, posix} from 'node:path';

const [docs, wiki, repository] = process.argv.slice(2);
if (!docs || !wiki || !repository)
  throw new Error('Usage: wiki-sync.mjs <docs> <wiki> <owner/repo>');

const SITE = 'https://everise.dev';
const raw = path =>
  `https://raw.githubusercontent.com/${repository}/main/docs/${path}`;
const baseurl =
  /^baseurl:\s*(\S+)/m.exec(
    readFileSync(join(docs, '_config.yml'), 'utf8'),
  )?.[1] ?? '';
const label =
  /^title:\s*(.+)$/m
    .exec(readFileSync(join(docs, '_config.yml'), 'utf8'))?.[1]
    .trim() ?? 'Docs';

// The pages: their front matter, body, and wiki name ("Home" for the overview).
function frontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const fields = {};
  for (const line of match?.[1].split('\n') ?? []) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return {fields, body: match ? text.slice(match[0].length) : text};
}
const slug = title =>
  title
    .replace(/[^A-Za-z0-9 ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');

const pages = [];
for (const folder of ['', 'features']) {
  const dir = join(docs, folder);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const {fields, body} = frontMatter(readFileSync(join(dir, file), 'utf8'));
    const path = posix.join(folder, file);
    const title = fields.title ?? file.replace(/\.md$/, '');
    const name = path === 'index.md' ? 'Home' : slug(title);
    pages.push({
      path,
      folder,
      title,
      name,
      body,
      order: Number(fields.nav_order ?? 99),
      parent: fields.parent ?? null,
    });
  }
}
// Two pages with one name: the feature page takes a prefix.
for (const p of pages) {
  if (p.folder && pages.some(o => o !== p && o.name === p.name))
    p.name = `Feature-${p.name}`;
}
const byPath = new Map(pages.map(p => [p.path, p]));

// A link or picture as the wiki needs it.
function wikiTarget(target, from) {
  const [address, hash = ''] = target.split('#');
  const anchor = hash ? `#${hash}` : '';
  if (/^(https?:|mailto:)/.test(address) || address === '') return target;
  // This site's own pages, by their everise.dev address or relative to the page.
  let path = null;
  if (address.startsWith(`${baseurl}/`))
    path = address.slice(baseurl.length + 1);
  else if (!address.startsWith('/'))
    path = posix.normalize(posix.join(posix.dirname(from.path), address));
  if (path !== null) {
    const page =
      path === '' || path.endsWith('/')
        ? `${path}index.md`
        : path.replace(/\.html$/, '.md');
    const found = byPath.get(page);
    if (found) return `${found.name}${anchor}`;
    if (/\.(png|svg|jpe?g|gif|webp)$/i.test(path)) return raw(path);
  }
  // Anything else on the site (the other repository's docs, the guide).
  return address.startsWith('/') ? `${SITE}${address}${anchor}` : target;
}

function wikiBody(page) {
  return (
    page.body
      // Kramdown's class markers: on their own line, or after an image.
      .replace(/^\{:[^}]*\}\n?/gm, '')
      .replace(/\)\{:[^}]*\}/g, ')')
      // Markdown links and pictures.
      .replace(
        /(!?\[[^\]]*\])\(([^)\s]+)\)/g,
        (_, text, target) => `${text}(${wikiTarget(target, page)})`,
      )
      // HTML links and pictures.
      .replace(
        /(href|src)="([^"]+)"/g,
        (_, attr, target) => `${attr}="${wikiTarget(target, page)}"`,
      )
  );
}

// Start from an empty wiki (but its git folder), so removed pages go too.
for (const file of readdirSync(wiki))
  if (file !== '.git') rmSync(join(wiki, file), {recursive: true, force: true});

const notice = `> This wiki is a copy of the repository's [\`docs/\`](https://github.com/${repository}/tree/main/docs) folder, written again on every merge to \`main\`. Edit \`docs/\`, not the wiki. The same pages, in the site's look: [everise.dev${baseurl}/](${SITE}${baseurl}/).\n\n`;
for (const page of pages) {
  writeFileSync(
    join(wiki, `${page.name}.md`),
    (page.name === 'Home' ? notice : '') + wikiBody(page),
  );
}

// The sidebar: the pages in the docs' own order, features under Features.
const top = pages.filter(p => !p.parent).sort((a, b) => a.order - b.order);
const lines = [`**${label}**`, ''];
for (const p of top) {
  lines.push(`- [${p.name === 'Home' ? 'Overview' : p.title}](${p.name})`);
  for (const k of pages
    .filter(c => c.parent === p.title)
    .sort((a, b) => a.order - b.order)) {
    lines.push(`  - [${k.title}](${k.name})`);
  }
}
lines.push(
  '',
  `[everise.dev${baseurl}/](${SITE}${baseurl}/) · [Site guide](${SITE}/guide/)`,
);
writeFileSync(join(wiki, '_Sidebar.md'), `${lines.join('\n')}\n`);
writeFileSync(
  join(wiki, '_Footer.md'),
  `Copied from [\`docs/\`](https://github.com/${repository}/tree/main/docs): edit there, not here.\n`,
);
console.log(`${pages.length} pages written to the wiki.`);
