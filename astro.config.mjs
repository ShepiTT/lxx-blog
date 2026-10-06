// @ts-check
import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // TODO：换成正式域名后，RSS、sitemap 和分享链接会自动跟着变
  site: 'https://shepitt.vercel.app',
  // The blog itself stays static; only /admin and /api/admin run on demand as Vercel functions.
  adapter: vercel(),
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') })],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  // 后台用到的密钥：本地写在 .env，线上在 Vercel 项目的 Environment Variables 里配置。
  env: {
    schema: {
      ADMIN_USERNAME: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_PASSWORD_HASH: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_REPO: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_BRANCH: envField.string({ context: 'server', access: 'secret', default: 'main' }),
    },
  },
});
