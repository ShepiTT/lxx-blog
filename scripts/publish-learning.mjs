// Publish only the verified daily lesson; GitHub CLI owns authentication.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'ShepiTT/lxx-blog';
const branch = 'main';
const site = 'https://lanjiangtao.cn';
const handbook = 'C:\\Users\\Administrator\\Documents\\Codex\\2026-09-05\\new-chat\\outputs\\AI产品架构师每日学习手册.docx';
const bundledPython = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const args = process.argv.slice(2);
const value = (key) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const allowed = new Set(['--date', '--docx', '--python', '--prepare', '--publish', '--dry-run']);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
  if (['--date', '--docx', '--python'].includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value: ${args[i]}`);
    i++;
  }
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const date = value('--date') ?? today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD.');
const modes = ['--prepare', '--publish', '--dry-run'].filter((key) => args.includes(key));
if (modes.length > 1) throw new Error('Choose one mode: --dry-run, --prepare or --publish.');
const mode = modes[0] ?? '--dry-run';

function run(command, argv, input) {
  const result = spawnSync(command, argv, { cwd: root, input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout;
}
function github(endpoint, method = 'GET', body) {
  const argv = ['api', endpoint, '--method', method, '-H', 'Accept: application/vnd.github+json'];
  if (body) argv.push('--input', '-');
  return JSON.parse(run('gh', argv, body ? JSON.stringify(body) : undefined));
}
function remoteArticle(relative) {
  const result = spawnSync('gh', ['api', `repos/${repo}/contents/${relative}?ref=${branch}`], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (/HTTP 404/.test(result.stderr)) return null;
    throw new Error(`Cannot read the article from GitHub: ${result.stderr.trim()}`);
  }
  const remote = JSON.parse(result.stdout);
  if (remote.type !== 'file' || remote.encoding !== 'base64') throw new Error('Unexpected GitHub content response.');
  return { sha: remote.sha, text: Buffer.from(remote.content, 'base64').toString('utf8') };
}
function saveReceipt(receipt, stage = 'result') {
  // Validation and failed attempts must not erase an earlier publication receipt.
  const suffix = stage !== 'result' ? `.${mode.slice(2)}.${stage}` : mode === '--publish' ? '' : `.${mode.slice(2)}`;
  const destination = path.join(root, 'output', 'learning-publication', `${date}${suffix}.json`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, destination);
}
function htmlEscape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
async function verifyLive(article) {
  const deadline = Date.now() + 240_000;
  let lastFailure = 'The expected article version is not present.';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${article.url}?publication-check=${Date.now()}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
      const html = (await response.text()).normalize('NFKC');
      if (response.ok && html.includes(htmlEscape(article.title).normalize('NFKC')) && html.includes(`data-learning-sha256="${article.contentSha256}"`)) return;
      lastFailure = response.ok ? 'The expected article content hash is not present.' : `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`GitHub contains the lesson, but the production page has not passed verification: ${article.url} (${lastFailure})`);
}

function safeError(error) {
  return String(error?.message ?? error)
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+)\b/g, '[redacted]')
    .replace(/(authorization\s*:\s*(?:bearer|token)\s+)\S+/gi, '$1[redacted]');
}

const receipt = { date, mode: mode.slice(2), startedAt: new Date().toISOString() };
try {
  const lesson = JSON.parse(run(value('--python') ?? bundledPython, [path.join(root, 'scripts', 'export-learning.py'), '--docx', value('--docx') ?? handbook, '--date', date]));
  if (lesson.date !== date || lesson.slug !== `ai-learning-${date}` || !lesson.markdown || lesson.topics?.length !== 6 || !/^[a-f0-9]{64}$/.test(lesson.contentSha256 ?? '')) throw new Error('Exporter returned invalid lesson metadata.');
  const sha256 = createHash('sha256').update(lesson.markdown, 'utf8').digest('hex');
  if (lesson.sha256 !== sha256) throw new Error('Lesson integrity check failed.');
  const relative = `src/content/blog/${lesson.slug}.md`;
  Object.assign(receipt, { issue: lesson.issue, title: lesson.title, topics: lesson.topics, sha256, contentSha256: lesson.contentSha256, sourceSha256: lesson.sourceSha256, path: relative, url: `${site}/posts/${lesson.slug}/`, validatedAt: new Date().toISOString() });

  if (mode === '--prepare') {
    const destination = path.join(root, relative);
    if (fs.existsSync(destination)) {
      if (fs.readFileSync(destination, 'utf8') !== lesson.markdown) throw new Error('A different local article already exists for this date; refusing to overwrite it.');
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, lesson.markdown, { encoding: 'utf8', flag: 'wx' });
    }
    receipt.status = 'prepared';
  } else if (mode === '--publish') {
    // A private repository without permission also returns 404; check access first.
    try {
      const repository = github(`repos/${repo}`);
      if (!repository.permissions?.push) throw new Error('The signed-in GitHub account does not have write access.');
      github(`repos/${repo}/branches/${branch}`);
    } catch (error) {
      throw new Error(`Cannot access ${repo} on ${branch}; check GitHub login and repository permissions. ${safeError(error)}`);
    }
    const remote = remoteArticle(relative);
    if (remote && remote.text !== lesson.markdown) throw new Error('A different published article already exists for this date; refusing to overwrite it.');
    if (remote) {
      receipt.status = 'already-published';
      receipt.blobSha = remote.sha;
    } else {
      try {
        const published = github(`repos/${repo}/contents/${relative}`, 'PUT', { branch, message: `content: publish AI learning ${date}`, content: Buffer.from(lesson.markdown, 'utf8').toString('base64') });
        receipt.status = 'published';
        receipt.commitSha = published.commit.sha;
        receipt.blobSha = published.content.sha;
      } catch (error) {
        // A concurrent run or a lost response may have created this exact file.
        let concurrent;
        try { concurrent = remoteArticle(relative); } catch {}
        if (concurrent?.text !== lesson.markdown) throw error;
        receipt.status = 'already-published';
        receipt.blobSha = concurrent.sha;
      }
    }
    const readBack = remoteArticle(relative);
    if (readBack?.text !== lesson.markdown) throw new Error('Published article read-back did not match the verified lesson.');
    receipt.githubVerifiedAt = new Date().toISOString();
    receipt.productionVerified = false;
    saveReceipt(receipt, 'pending');
    await verifyLive(receipt);
    receipt.productionVerified = true;
    receipt.verifiedAt = new Date().toISOString();
  } else receipt.status = 'validated';
  receipt.completedAt = new Date().toISOString();
  saveReceipt(receipt);
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  const failed = { ...receipt, previousStatus: receipt.status, status: 'failed', failedAt: new Date().toISOString(), error: safeError(error) };
  try { saveReceipt(failed, 'failed'); } catch (writeError) { console.error(`Cannot save failure receipt: ${safeError(writeError)}`); }
  console.error(`publish-learning: ${failed.error}`);
  process.exitCode = 1;
}
