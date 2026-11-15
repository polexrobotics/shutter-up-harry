import { defineConfig } from 'astro/config';

// Static site: every page is pre-built, so it can be hosted free on Netlify, Vercel or Cloudflare Pages.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  output: 'static',
});
