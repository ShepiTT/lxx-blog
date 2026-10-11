// On-page edit mode. Loaded only for a logged-in admin (see EditMode.astro).
// Elements marked with data-edit="<key>" become clickable; each key opens a small editor
// that saves through /api/admin/data. Post cards and talks get edit / delete buttons.
// Inlined and injected at runtime so the stylesheet isn't linked into every visitor's page.
import editorCss from './editor.css?inline';
import { toast } from '../admin/toast';
import { uploadImage } from '../admin/upload-client';

type FileName = 'site' | 'links' | 'album';
interface Social { name: string; href: string; icon: string }
interface Stat { value: string; label: string }
interface Intro { role: string; text: string; stats?: Stat[]; skills: string[]; now: string[]; hobbies?: string[]; email: string }
interface Site {
  title: string; author: string; description: string; motto: string; typewriter: string[];
  notice: string; avatar: string; heroImage: string; startDate: string; socials: Social[]; intro?: Intro;
}
interface FriendLink { name: string; url: string; avatar: string; description: string }
interface Album { name: string; description: string; photos: { src: string; caption?: string }[] }

const ICONS: Record<string, string> = {
  github: 'GitHub', x: 'X', wechat: '公众号 / 微信', mail: '邮箱', rss: 'RSS', bilibili: 'B 站', link: '其他链接',
};

const SITE_FIELDS = {
  title: { label: '网站标题', kind: 'text', max: 40, required: true },
  author: { label: '作者名', kind: 'text', max: 30, required: true },
  motto: { label: '座右铭', kind: 'text', max: 60 },
  notice: { label: '公告', kind: 'textarea', max: 300 },
  typewriter: { label: '首屏标语', kind: 'lines', hint: '每行一句，会一句一句轮流打出来' },
  description: { label: '网站简介', kind: 'textarea', max: 200, hint: '显示在搜索结果和分享卡片里' },
  startDate: { label: '建站日期', kind: 'date', required: true, hint: '用来计算「本站已运行」天数' },
} as const;
type SiteField = keyof typeof SITE_FIELDS;
const ALL_SITE_FIELDS = Object.keys(SITE_FIELDS) as SiteField[];

const root = document.documentElement;
let mode = 'local';

// ---------- API ----------
function forget() {
  try { localStorage.removeItem('admin-hint'); sessionStorage.removeItem('edit-mode'); } catch {}
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, headers: init.body ? { 'Content-Type': 'application/json' } : undefined });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) {
    forget();
    throw new Error('登录已过期，请重新登录后台');
  }
  if (!res.ok) throw new Error(out.error ?? '请求失败');
  return out;
}

const shas = new Map<FileName, string>();
async function load<T>(file: FileName): Promise<T> {
  const out = await api(`/api/admin/data?file=${file}`);
  shas.set(file, out.sha);
  return out.data as T;
}
async function save(file: FileName, data: unknown) {
  await api('/api/admin/data', { method: 'PUT', body: JSON.stringify({ file, data, sha: shas.get(file) }) });
  shas.delete(file);
}

const savedMessage = (needsRebuild = false) => {
  if (mode === 'github') return '已保存，网站约 1 分钟后更新';
  return needsRebuild ? '已保存，页面马上会自动刷新' : '已保存';
};

const run = (task: () => Promise<unknown>) => task().catch((err) => toast((err as Error).message || '出错了', true));

// ---------- DOM helpers ----------
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child != null && child !== false) el.append(child);
  return el;
}

const field = (label: string, input: HTMLElement, hint?: string) =>
  h('label', { class: 'ed-field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);

function pickFiles(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple });
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

function openDialog(title: string, body: HTMLElement, onSave: () => Promise<void>, opts: { wide?: boolean } = {}) {
  const dialog = h('dialog', { class: `ed-dialog${opts.wide ? ' wide' : ''}` });
  // Remove explicitly rather than relying on the dialog's async "close" event.
  const dismiss = () => { if (dialog.open) dialog.close(); dialog.remove(); };
  const error = h('p', { class: 'ed-error', hidden: true });
  const saveBtn = h('button', { type: 'submit', class: 'ed-btn primary' }, '保存');
  const form = h('form', {},
    h('h2', {}, title),
    h('div', { class: 'ed-body' }, body),
    error,
    h('div', { class: 'ed-actions' },
      h('button', { type: 'button', class: 'ed-btn', onclick: dismiss }, '取消'),
      saveBtn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    error.hidden = true;
    try {
      await onSave();
      dismiss();
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  });
  dialog.append(form);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

const removeButton = (onClick: () => void, title = '删除') =>
  h('button', { type: 'button', class: 'ed-icon-btn', title, 'aria-label': title, onclick: onClick }, '×');

// ---------- Site text fields ----------
function applySite(site: Site, keys: SiteField[]) {
  for (const key of keys) {
    if (key === 'typewriter') {
      document.querySelectorAll<HTMLElement>('[data-typewriter]').forEach((el) => {
        el.dataset.typewriter = JSON.stringify(site.typewriter);
        el.textContent = site.typewriter[0];
      });
    } else if (key === 'startDate') {
      document.querySelectorAll<HTMLElement>('[data-runtime]').forEach((el) => { el.dataset.start = site.startDate; });
    } else {
      document.querySelectorAll<HTMLElement>(`[data-edit="site.${key}"]`).forEach((el) => { el.textContent = site[key]; });
    }
  }
}

async function editSiteFields(keys: SiteField[], title: string) {
  const site = await load<Site>('site');
  const inputs = new Map<SiteField, HTMLInputElement | HTMLTextAreaElement>();
  const body = h('div', { class: 'ed-fields' });
  for (const key of keys) {
    const spec = SITE_FIELDS[key];
    const common = { maxLength: 'max' in spec ? spec.max : undefined, required: 'required' in spec && spec.required };
    const input = spec.kind === 'textarea' || spec.kind === 'lines'
      ? h('textarea', { ...common, rows: spec.kind === 'lines' ? 4 : 3, value: spec.kind === 'lines' ? site.typewriter.join('\n') : String(site[key]) })
      : h('input', { ...common, type: spec.kind === 'date' ? 'date' : 'text', value: String(site[key]) });
    inputs.set(key, input);
    body.append(field(spec.label, input, 'hint' in spec ? spec.hint : undefined));
  }
  openDialog(title, body, async () => {
    for (const [key, input] of inputs) {
      if (SITE_FIELDS[key].kind === 'lines') site.typewriter = input.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else (site as unknown as Record<string, string>)[key] = input.value.trim();
    }
    await save('site', site);
    applySite(site, keys);
    toast(savedMessage());
  });
}

// ---------- Images ----------
async function changeImage(key: 'avatar' | 'heroImage') {
  const [file] = await pickFiles();
  if (!file) return;
  toast('图片上传中…');
  const { url, preview } = await uploadImage(file);
  const site = await load<Site>('site');
  site[key] = url;
  await save('site', site);
  if (key === 'avatar') {
    document.querySelectorAll<HTMLImageElement>('img[data-edit="site.avatar"], .talk-avatar, .drawer-author img').forEach((img) => { img.src = preview; });
  } else {
    document.querySelectorAll<HTMLElement>('[data-hero-image], .footer').forEach((el) => {
      if (el.classList.contains('banner-bg')) el.style.backgroundImage = `url('${preview}')`;
      else el.style.setProperty('--banner-image', `url('${preview}')`);
    });
  }
  toast(savedMessage());
}

// ---------- Social links ----------
async function editSocials() {
  const site = await load<Site>('site');
  const list = h('div', { class: 'ed-rows' });
  const addRow = (s: Social = { name: '', href: '', icon: 'link' }) => {
    const row: HTMLElement = h('div', { class: 'ed-row' },
      h('select', { 'data-k': 'icon' }, ...Object.entries(ICONS).map(([value, label]) => h('option', { value, selected: value === s.icon }, label))),
      h('input', { 'data-k': 'name', value: s.name, placeholder: '名称', required: true, maxLength: 20 }),
      h('input', { 'data-k': 'href', value: s.href, placeholder: 'https://… / mailto:… / #', required: true, maxLength: 300, class: 'grow' }),
      removeButton(() => row.remove()));
    list.append(row);
  };
  site.socials.forEach(addRow);
  const body = h('div', {}, list,
    h('button', { type: 'button', class: 'ed-btn', onclick: () => addRow() }, '+ 添加链接'),
    h('p', { class: 'ed-hint' }, '链接以 https://、mailto: 或 / 开头；暂时没有的可以先填 #'));
  openDialog('社交链接', body, async () => {
    site.socials = [...list.querySelectorAll<HTMLElement>('.ed-row')].map((row) => {
      const get = (k: string) => row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k="${k}"]`)!.value.trim();
      return { icon: get('icon'), name: get('name'), href: get('href') };
    });
    await save('site', site);
    toast(savedMessage(true));
  }, { wide: true });
}

// ---------- Friend links ----------
async function editLinks() {
  const links = await load<FriendLink[]>('links');
  const list = h('div', { class: 'ed-rows' });
  const addRow = (l: FriendLink = { name: '', url: '', avatar: '', description: '' }) => {
    const avatar = h('input', { 'data-k': 'avatar', value: l.avatar, placeholder: '头像网址', required: true, maxLength: 300, class: 'grow' });
    const row: HTMLElement = h('div', { class: 'ed-card' },
      h('div', { class: 'ed-row' },
        h('input', { 'data-k': 'name', value: l.name, placeholder: '博客名称', required: true, maxLength: 40 }),
        h('input', { 'data-k': 'url', value: l.url, placeholder: 'https://…', required: true, maxLength: 300, class: 'grow' }),
        removeButton(() => row.remove())),
      h('div', { class: 'ed-row' },
        avatar,
        h('button', { type: 'button', class: 'ed-btn', onclick: () => run(async () => {
          const [file] = await pickFiles();
          if (!file) return;
          toast('图片上传中…');
          avatar.value = (await uploadImage(file)).url;
          toast('头像已上传');
        }) }, '上传头像')),
      h('input', { 'data-k': 'description', value: l.description, placeholder: '一句话介绍', maxLength: 60 }));
    list.append(row);
  };
  links.forEach(addRow);
  const body = h('div', {}, list, h('button', { type: 'button', class: 'ed-btn', onclick: () => addRow() }, '+ 添加友链'));
  openDialog('管理友链', body, async () => {
    const next = [...list.querySelectorAll<HTMLElement>('.ed-card')].map((row) => {
      const get = (k: string) => row.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!.value.trim();
      return { name: get('name'), url: get('url'), avatar: get('avatar'), description: get('description') };
    });
    await save('links', next);
    toast(savedMessage(true));
  }, { wide: true });
}

// ---------- Album ----------
async function editAlbum() {
  const albums = await load<Album[]>('album');
  const previews = new Map<string, string>();
  const wrap = h('div', { class: 'ed-albums' });

  const renderAlbum = (album: Album) => {
    const photos = h('div', { class: 'ed-photos' });
    const addPhoto = (p: { src: string; caption?: string }) => {
      const cell: HTMLElement = h('div', { class: 'ed-photo', 'data-src': p.src },
        h('img', { src: previews.get(p.src) ?? p.src, alt: '' }),
        h('input', { value: p.caption ?? '', placeholder: '说明（可选）', maxLength: 60 }),
        removeButton(() => cell.remove(), '移除这张照片'));
      photos.append(cell);
    };
    album.photos.forEach(addPhoto);
    const block: HTMLElement = h('section', { class: 'ed-album' },
      h('div', { class: 'ed-row' },
        h('input', { 'data-k': 'name', value: album.name, placeholder: '相册名称', required: true, maxLength: 30 }),
        h('input', { 'data-k': 'description', value: album.description, placeholder: '一句话描述', maxLength: 100, class: 'grow' }),
        removeButton(() => { if (confirm(`删除相册「${album.name}」？照片文件会保留，只是不再显示。`)) block.remove(); }, '删除相册')),
      photos,
      h('button', { type: 'button', class: 'ed-btn', onclick: () => run(async () => {
        const files = await pickFiles(true);
        for (const [i, file] of files.entries()) {
          toast(`照片上传中（${i + 1}/${files.length}）…`);
          const { url, preview } = await uploadImage(file);
          previews.set(url, preview);
          addPhoto({ src: url });
        }
        if (files.length) toast('照片已上传，记得点保存');
      }) }, '+ 上传照片'));
    wrap.append(block);
  };

  albums.forEach(renderAlbum);
  const body = h('div', {}, wrap, h('button', { type: 'button', class: 'ed-btn', onclick: () => renderAlbum({ name: '新相册', description: '', photos: [] }) }, '+ 新建相册'));
  openDialog('管理相册', body, async () => {
    const next = [...wrap.querySelectorAll<HTMLElement>('.ed-album')].map((block) => ({
      name: block.querySelector<HTMLInputElement>('[data-k="name"]')!.value.trim(),
      description: block.querySelector<HTMLInputElement>('[data-k="description"]')!.value.trim(),
      photos: [...block.querySelectorAll<HTMLElement>('.ed-photo')].map((cell) => {
        const caption = cell.querySelector('input')!.value.trim();
        return caption ? { src: cell.dataset.src!, caption } : { src: cell.dataset.src! };
      }),
    }));
    await save('album', next);
    toast(savedMessage(true));
  }, { wide: true });
}

// ---------- Home page introduction ----------
const lines = (value: string) => value.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean);

// "4 年 | 接触 AI" per line → { value, label }.
const parseStats = (value: string): Stat[] => value.split('\n').map((line) => {
  const [v = '', ...rest] = line.split(/[|｜]/);
  return { value: v.trim(), label: rest.join('|').trim() };
}).filter((s) => s.value && s.label);

function applyIntro(intro: Intro) {
  const card = document.querySelector<HTMLElement>('.intro-card');
  const head = card?.querySelector<HTMLElement>('.intro-head');
  if (!card || !head) return;

  // Mirrors IntroCard.astro: keep the editable root and the avatar/greeting, rebuild the rest.
  const icon = (name: 'flower' | 'sun' | 'mail') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ class: 'icon', width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    svg.innerHTML = {
      mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
      flower: '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C9 6 10.5 3 12 3s3 3 0 6.8M14.1 11.3c3.7-2.6 6.7-1 6.7.6s-3.1 3-6.7.4M13.3 14.2c1.6 4.4-.6 6.9-2.2 6.4s-2-3.8.9-6.4M10.7 14.2c-3.9 2.4-6.6.4-6.3-1.2s3.6-2.6 6.3 1.2M9.9 11.3C5.5 10.6 4.8 7.3 6.2 6.4s4.2.4 3.7 4.9"/>',
    }[name];
    return svg;
  };
  const list = (items: string[], props: Record<string, unknown> = {}) => h('ul', props, ...items.map((x) => h('li', {}, x)));

  head.querySelector('.intro-role')?.remove();
  if (intro.role) head.querySelector(':scope > div')?.append(h('p', { class: 'intro-role' }, intro.role));

  const stats = intro.stats ?? [];
  const hobbies = intro.hobbies ?? [];
  const paragraphs = intro.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const side = intro.now.length || hobbies.length
    ? h('div', { class: 'intro-now' },
      intro.now.length > 0 && h('h3', {}, icon('flower'), ' 现在在做'),
      intro.now.length > 0 && list(intro.now),
      hobbies.length > 0 && h('h3', {}, icon('sun'), ' 工作之外'),
      hobbies.length > 0 && list(hobbies, { class: 'intro-hobbies' }))
    : null;

  card.replaceChildren(
    head,
    stats.length ? h('ul', { class: 'intro-stats' }, ...stats.map((s) => h('li', {}, h('strong', {}, s.value), h('span', {}, s.label)))) : '',
    h('div', { class: 'intro-body' },
      h('div', { class: 'intro-text' },
        ...paragraphs.map((p) => h('p', {}, p)),
        intro.skills.length > 0 && list(intro.skills, { class: 'intro-skills', 'aria-label': '技能与关注领域' })),
      side),
    h('div', { class: 'intro-actions' },
      intro.email && h('a', { class: 'follow-button', href: `mailto:${intro.email}` }, icon('mail'), ' 发邮件给我'),
      intro.email && h('span', { class: 'intro-email' }, intro.email)),
  );
}

async function editIntro() {
  const site = await load<Site>('site');
  const intro: Intro = site.intro ?? { role: '', text: '', skills: [], now: [], email: '' };
  const role = h('input', { value: intro.role, maxLength: 40, placeholder: '例如：AI 产品全栈开发 & 产品经理' });
  const text = h('textarea', { value: intro.text, rows: 7, maxLength: 800 });
  const stats = h('textarea', { value: (intro.stats ?? []).map((s) => `${s.value} | ${s.label}`).join('\n'), rows: 3, placeholder: '4 年 | 接触 AI' });
  const skills = h('textarea', { value: intro.skills.join('\n'), rows: 4 });
  const now = h('textarea', { value: intro.now.join('\n'), rows: 4 });
  const hobbies = h('textarea', { value: (intro.hobbies ?? []).join('\n'), rows: 2, placeholder: '📷 摄影' });
  const email = h('input', { type: 'email', value: intro.email, maxLength: 100, placeholder: 'name@example.com' });
  openDialog('编辑个人介绍', h('div', { class: 'ed-fields' },
    field('身份', role),
    field('个人介绍', text, '空一行就是新的一段'),
    field('经历数字', stats, '每行一个，格式「数字 | 说明」，最多 4 个'),
    field('技能 / 关注领域', skills, '每行一个，也可以用逗号分隔'),
    field('现在在做', now, '每行一件事'),
    field('工作之外', hobbies, '爱好，每行一个，也可以用逗号分隔'),
    field('联系邮箱', email, '留空就不显示「发邮件给我」按钮')), async () => {
    site.intro = {
      role: role.value.trim(), text: text.value.trim(), stats: parseStats(stats.value),
      skills: lines(skills.value), now: lines(now.value), hobbies: lines(hobbies.value), email: email.value.trim(),
    };
    await save('site', site);
    applyIntro(site.intro);
    toast(savedMessage());
  }, { wide: true });
}

// ---------- Posts & talks ----------
async function removeItem(type: 'blog' | 'talks', id: string, name: string, el: HTMLElement) {
  if (!confirm(`确定删除「${name}」吗？删除后网站上也会消失。`)) return;
  await api('/api/admin/item', { method: 'DELETE', body: JSON.stringify({ type, id }) });
  el.classList.add('ed-removed');
  toast(mode === 'github' ? '已删除，网站约 1 分钟后更新' : '已删除');
}

function decorateItems() {
  const add = (el: HTMLElement, type: 'blog' | 'talks', id: string, name: string) => {
    el.append(h('div', { class: 'ed-item-actions' },
      h('a', { class: 'ed-btn small', href: `/admin/edit/?type=${type}&id=${encodeURIComponent(id)}` }, '编辑'),
      h('button', { type: 'button', class: 'ed-btn small danger', onclick: () => run(() => removeItem(type, id, name, el)) }, '删除')));
  };
  document.querySelectorAll<HTMLElement>('[data-post-id]').forEach((el) => add(el, 'blog', el.dataset.postId!, el.dataset.postTitle ?? el.dataset.postId!));
  document.querySelectorAll<HTMLElement>('[data-talk-id]').forEach((el) => add(el, 'talks', el.dataset.talkId!, '这条说说'));
}

// ---------- Mode switching ----------
function openEditor(key: string) {
  if (key === 'site.avatar') return changeImage('avatar');
  if (key === 'site.socials') return editSocials();
  if (key === 'site.intro') return editIntro();
  if (key.startsWith('site.')) {
    const field = key.slice(5) as SiteField;
    return editSiteFields([field], SITE_FIELDS[field]?.label ?? '修改');
  }
  if (key === 'links') return editLinks();
  if (key === 'album') return editAlbum();
  return Promise.resolve();
}

let toolbar: HTMLElement | null = null;
const toggleButton = () => document.querySelector<HTMLButtonElement>('[data-edit-toggle]');

function setEditing(on: boolean) {
  root.classList.toggle('editing', on);
  try { sessionStorage.setItem('edit-mode', on ? 'on' : 'off'); } catch {}
  toggleButton()?.setAttribute('aria-pressed', String(on));
  document.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) => {
    if (on) el.title = el.dataset.editLabel ?? '点击修改';
    else el.removeAttribute('title');
  });
  if (on && !toolbar) {
    toolbar = h('div', { class: 'ed-toolbar', role: 'toolbar', 'aria-label': '编辑模式' },
      h('strong', {}, '编辑模式'),
      h('span', { class: 'ed-tip' }, mode === 'unconfigured' ? '后台还没连接 GitHub，暂时无法保存' : '点击虚线框里的内容即可修改'),
      h('button', { type: 'button', onclick: () => run(() => editSiteFields(ALL_SITE_FIELDS, '站点设置')) }, '站点设置'),
      h('button', { type: 'button', onclick: () => run(() => changeImage('heroImage')) }, '更换首屏图'),
      h('a', { href: '/admin/edit/?type=blog' }, '写文章'),
      h('a', { href: '/admin/edit/?type=talks' }, '发说说'),
      h('a', { href: '/admin/' }, '后台'),
      h('button', { type: 'button', class: 'ed-exit', onclick: () => setEditing(false) }, '退出编辑'));
    document.body.append(toolbar);
  }
  if (toolbar) toolbar.hidden = !on;
}

export async function init() {
  const params = new URLSearchParams(location.search);
  const requestedEditing = params.get('edit') === '1';
  document.head.append(h('style', { textContent: editorCss }));
  try {
    const res = await fetch('/api/admin/session');
    if (!res.ok) {
      if (res.status === 401) {
        forget();
        if (requestedEditing) {
          const next = location.pathname + location.search + location.hash;
          location.href = `/admin/login/?next=${encodeURIComponent(next)}`;
        }
      }
      return;
    }
    mode = (await res.json()).mode;
  } catch {
    return;
  }

  const toggle = toggleButton();
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => setEditing(!root.classList.contains('editing')));
  }
  decorateItems();

  // In edit mode, clicking a marked element edits it instead of following links or opening photos.
  document.addEventListener('click', (e) => {
    if (!root.classList.contains('editing')) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    if (!target || target.closest('.ed-toolbar, .ed-dialog')) return;
    e.preventDefault();
    e.stopPropagation();
    run(() => openEditor(target.dataset.edit!));
  }, true);

  let wanted = requestedEditing;
  try { wanted ||= sessionStorage.getItem('edit-mode') === 'on'; } catch {}
  if (params.has('edit')) {
    params.delete('edit');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
  }
  if (wanted) setEditing(true);
}
