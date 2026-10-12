// Where the admin reads and writes content.
// - Online: the GitHub repo (each save is a commit, and Vercel redeploys the site).
// - Local `npm run dev` without GITHUB_TOKEN: the project folder itself, so changes show up instantly.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH } from 'astro:env/server';

export interface StoredFile {
  path: string;
  content: string;
  sha: string;
}

export interface Storage {
  mode: 'github' | 'local';
  list(dir: string): Promise<{ name: string; path: string }[]>;
  read(path: string): Promise<StoredFile | null>;
  /** `content` is UTF-8 text unless `base64` is true. `sha` guards against overwriting someone else's newer edit. */
  write(path: string, content: string, message: string, opts?: { sha?: string; base64?: boolean }): Promise<void>;
  remove(path: string, message: string, sha: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

const githubHeaders = () => ({
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'lxx-blog-admin',
});

const githubStorage = (branch: string): Storage => {
  const api = `https://api.github.com/repos/${GITHUB_REPO}/contents`;
  const headers = githubHeaders();
  const url = (path: string) => `${api}/${path.split('/').map(encodeURIComponent).join('/')}`;

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(init.method && init.method !== 'GET' ? url(path) : `${url(path)}?ref=${encodeURIComponent(branch)}`, {
      ...init,
      headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (res.status === 404) {
      if (!init.method || init.method === 'GET') return null;
      throw new StorageError('GitHub 找不到仓库或无权写入，请检查 GITHUB_REPO 和 GITHUB_TOKEN 的仓库权限。', 502);
    }
    if (res.status === 409 || res.status === 422) throw new StorageError('文件已被其他地方修改过，请刷新后台后再保存。', 409);
    if (res.status === 401 || res.status === 403) throw new StorageError('GitHub 拒绝访问，请检查 GITHUB_TOKEN 是否有效、是否有这个仓库的读写权限。', 502);
    if (!res.ok) throw new StorageError(`GitHub 请求失败（${res.status}）`, 502);
    return res.json();
  };

  return {
    mode: 'github',
    async list(dir) {
      const items = (await call(dir)) ?? [];
      return (items as { type: string; name: string; path: string }[])
        .filter((i) => i.type === 'file')
        .map(({ name, path }) => ({ name, path }));
    },
    async read(path) {
      const file = await call(path);
      if (!file) return null;
      return { path, sha: file.sha, content: Buffer.from(file.content, 'base64').toString('utf8') };
    },
    async write(path, content, message, opts = {}) {
      await call(path, {
        method: 'PUT',
        body: JSON.stringify({
          message,
          branch,
          content: opts.base64 ? content : Buffer.from(content, 'utf8').toString('base64'),
          ...(opts.sha ? { sha: opts.sha } : {}),
        }),
      });
    },
    async remove(path, message, sha) {
      await call(path, { method: 'DELETE', body: JSON.stringify({ message, sha, branch }) });
    },
  };
};

const localStorage = (): Storage => {
  const root = process.cwd();
  const sha = (content: string | Buffer) => createHash('sha1').update(content).digest('hex');
  return {
    mode: 'local',
    async list(dir) {
      try {
        const names = await readdir(join(root, dir));
        return names.map((name) => ({ name, path: `${dir}/${name}` }));
      } catch {
        return [];
      }
    },
    async read(path) {
      try {
        const content = await readFile(join(root, path), 'utf8');
        return { path, content, sha: sha(content) };
      } catch {
        return null;
      }
    },
    async write(path, content, _message, opts = {}) {
      const target = join(root, path);
      if (opts.sha) {
        const current = await readFile(target, 'utf8').catch(() => null);
        if (current !== null && sha(current) !== opts.sha) throw new StorageError('文件已被其他地方修改过，请刷新后台后再保存。', 409);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, opts.base64 ? Buffer.from(content, 'base64') : content);
    },
    async remove(path) {
      await unlink(join(root, path));
    },
  };
};

/** `branch` defaults to the site's branch; the guestbook keeps its data on a branch of its own. */
export function getStorage(opts: { branch?: string } = {}): Storage {
  if (GITHUB_TOKEN && GITHUB_REPO) return githubStorage(opts.branch ?? GITHUB_BRANCH);
  if (import.meta.env.DEV) return localStorage();
  throw new StorageError('后台还没有连接 GitHub：请在 Vercel 环境变量里配置 GITHUB_TOKEN 和 GITHUB_REPO。', 503);
}

/**
 * Creates `branch` as a new history (no parent commit) holding just `files`, so data kept there never
 * mixes with the site's code. Fails with status 409 if the branch already exists.
 */
export async function createOrphanBranch(branch: string, files: Record<string, string>, message: string) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new StorageError('没有连接 GitHub', 503);
  const api = `https://api.github.com/repos/${GITHUB_REPO}/git`;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${api}/${path}`, {
      method: 'POST',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 422 && path === 'refs') throw new StorageError('分支已存在', 409);
    if (!res.ok) throw new StorageError(`GitHub 请求失败（${res.status}）`, 502);
    return res.json() as Promise<{ sha: string }>;
  };
  const tree = await post('trees', {
    tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
  });
  const commit = await post('commits', { message, tree: tree.sha, parents: [] });
  await post('refs', { ref: `refs/heads/${branch}`, sha: commit.sha });
}
