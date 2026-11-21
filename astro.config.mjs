import { defineConfig } from 'astro/config';

// Static site: every page is pre-built. Hosted on GitHub Pages at shutterupharry.com.au (see .github/workflows/deploy.yml).
export default defineConfig({
  site: process.env.SITE_URL || 'https://shutterupharry.com.au',
  output: 'static',
});
