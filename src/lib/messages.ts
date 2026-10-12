// 留言板。留言存在 GitHub 仓库单独的 `messages` 分支（messages.json），和网站代码分开，也不会触发部署；
// 本地 `npm run dev` 没有 GitHub 令牌时存在 .data/messages.json。
// 留言只当纯文字处理：服务端清掉不可见字符、拒绝 HTML / 脚本 / 链接，页面也只用 textContent 显示。
import { createHmac, randomBytes } from 'node:crypto';
import { ADMIN_SESSION_SECRET } from 'astro:env/server';
import { createOrphanBranch, getStorage, StorageError } from './admin/storage';
import { MESSAGE_LIMITS } from './message-rules';
import { SITE } from '../site.config';

const BRANCH = 'messages';
// The branch's own vercel.json stops Vercel from deploying it on every new message.
const BRANCH_VERCEL_JSON = `${JSON.stringify({ git: { deploymentEnabled: false } }, null, 2)}\n`;

export interface Message {
  id: string;
  name: string;
  text: string;
  time: string;
}
/** `who` is a keyed hash of the visitor's IP, only used for rate limits and never sent to the page. */
interface StoredMessage extends Message {
  who: string;
}

/** An error whose message is safe and meant to be shown to the visitor. */
export class MessageError extends StorageError {}

// Control characters, zero-width characters and bidi overrides (used to hide or flip text).
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Markup, script-like text and template syntax.
const CODE = /[<>]|&#|&[a-z]+;|javascript:|vbscript:|data:|\bon[a-z]+\s*=|\$\{|\{\{|\{%/i;
const LINK = /https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|top|xyz|io|cc|me|vip|site|info)\b/i;
// Names that would pass as the site owner.
const author = SITE.author.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const IMPERSONATE = new RegExp(`博主|站长|管理员|admin|^${author}$`, 'i');

const clean = (value: unknown) => String(value ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
const length = (s: string) => [...s].length;

function check(name: string, text: string) {
  if (!name) throw new MessageError('请填写昵称', 400);
  if (!text) throw new MessageError('请写点什么吧', 400);
  if (length(name) > MESSAGE_LIMITS.name) throw new MessageError(`昵称最多 ${MESSAGE_LIMITS.name} 个字`, 400);
  if (length(text) > MESSAGE_LIMITS.text) throw new MessageError(`留言最多 ${MESSAGE_LIMITS.text} 个字`, 400);
  if (CODE.test(name) || CODE.test(text)) throw new MessageError('留言只支持纯文字，不能包含 < > 等代码符号', 400);
  if (LINK.test(name) || LINK.test(text)) throw new MessageError('留言里不能放链接', 400);
  if (IMPERSONATE.test(name)) throw new MessageError('换个昵称吧', 400);
}

const visitor = (ip: string) =>
  createHmac('sha256', ADMIN_SESSION_SECRET || 'local-dev').update(`guestbook:${ip}`).digest('hex').slice(0, 20);

const strip = ({ id, name, text, time }: StoredMessage): Message => ({ id, name, text, time });

async function load() {
  const store = getStorage({ branch: BRANCH });
  const path = store.mode === 'github' ? 'messages.json' : '.data/messages.json';
  const file = await store.read(path);
  let messages: StoredMessage[] = [];
  if (file) {
    try {
      const parsed = JSON.parse(file.content);
      if (Array.isArray(parsed?.messages)) messages = parsed.messages;
    } catch {}
  }
  const save = async (next: StoredMessage[], commit: string) => {
    const content = `${JSON.stringify({ messages: next }, null, 2)}\n`;
    if (!file && store.mode === 'github') {
      // First message ever: create the data branch. If someone else just created it, retry normally.
      try {
        return await createOrphanBranch(BRANCH, { 'messages.json': content, 'vercel.json': BRANCH_VERCEL_JSON }, commit);
      } catch (err) {
        if (!(err instanceof StorageError && err.status === 409)) throw err;
      }
    }
    await store.write(path, content, commit, { sha: file?.sha });
  };
  return { messages, save };
}

/** Writes are guarded by the file's sha; on a clash with another visitor, reload and try again. */
async function update<T>(change: (messages: StoredMessage[]) => { next: StoredMessage[]; commit: string; result: T }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { messages, save } = await load();
    const { next, commit, result } = change(messages);
    try {
      await save(next, commit);
      return result;
    } catch (err) {
      if (!(err instanceof StorageError && err.status === 409) || err instanceof MessageError) throw err;
    }
  }
  throw new MessageError('留言的人有点多，请再试一次', 503);
}

export async function listMessages(): Promise<Message[]> {
  const { messages } = await load();
  return messages.map(strip);
}

export async function addMessage(raw: Record<string, unknown>, ip: string): Promise<Message> {
  if (typeof raw.name !== 'string' || typeof raw.text !== 'string') {
    throw new MessageError('昵称和留言内容格式不正确', 400);
  }
  const name = clean(raw.name);
  const text = clean(raw.text);
  check(name, text);
  const who = visitor(ip);

  return update((messages) => {
    const now = Date.now();
    const since = (m: StoredMessage) => now - Date.parse(m.time);
    const mine = messages.filter((m) => m.who === who && since(m) < 86_400_000);
    if (mine.some((m) => since(m) < MESSAGE_LIMITS.gapSeconds * 1000)) throw new MessageError('留言太快啦，歇一分钟再来吧', 429);
    if (mine.length >= MESSAGE_LIMITS.perDay) throw new MessageError('今天留言次数到上限了，明天再来吧', 429);
    if (mine.some((m) => m.text === text)) throw new MessageError('这条已经留过啦', 409);
    if (messages.filter((m) => since(m) < 3_600_000).length >= MESSAGE_LIMITS.sitePerHour) {
      throw new MessageError('留言板有点忙，请稍后再来', 429);
    }
    const message: StoredMessage = { id: randomBytes(6).toString('hex'), name, text, time: new Date(now).toISOString(), who };
    return { next: [message, ...messages].slice(0, MESSAGE_LIMITS.keep), commit: `新留言 ${message.id}`, result: strip(message) };
  });
}

export async function deleteMessage(id: string) {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new MessageError('参数不正确', 400);
  await update((messages) => {
    if (!messages.some((m) => m.id === id)) throw new MessageError('留言不存在，可能已经删除了', 404);
    return { next: messages.filter((m) => m.id !== id), commit: `删除留言 ${id}`, result: null };
  });
}
