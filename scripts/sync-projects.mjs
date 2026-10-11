// Refreshes src/data/projects.json from the public repositories of the GitHub account
// linked in src/data/site.json (socials → GitHub). Forks and archived repos are skipped.
// Usage: npm run projects:sync
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const site = JSON.parse(readFileSync(new URL('src/data/site.json', root), 'utf8'));
const github = site.socials.find((s) => s.icon === 'github')?.href ?? '';
const user = github.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/)?.[1];
if (!user) {
  console.error('sync-projects: site.json 里没有有效的 GitHub 主页链接（https://github.com/用户名）');
  process.exit(1);
}

const res = await fetch(`https://api.github.com/users/${user}/repos?type=owner&sort=pushed&per_page=100`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lxx-blog-sync-projects' },
});
if (!res.ok) {
  console.error(`sync-projects: GitHub 返回 ${res.status}，稍后再试`);
  process.exit(1);
}

const projects = (await res.json())
  .filter((r) => !r.fork && !r.archived && !r.private)
  .map((r) => ({
    name: r.name,
    description: r.description ?? '',
    url: r.html_url,
    homepage: r.homepage || '',
    language: r.language ?? '',
    stars: r.stargazers_count,
    updated: r.pushed_at.slice(0, 10),
  }))
  // Most-starred first, then most recently updated.
  .sort((a, b) => b.stars - a.stars || b.updated.localeCompare(a.updated));

writeFileSync(new URL('src/data/projects.json', root), `${JSON.stringify(projects, null, 2)}\n`);
console.log(`sync-projects: 已更新 ${projects.length} 个项目（${user}）`);
