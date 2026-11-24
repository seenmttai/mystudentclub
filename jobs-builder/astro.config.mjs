// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  // Job pages import ../scripts/job-seo.js (shared with the portal), which sits outside this folder.
  vite: { server: { fs: { allow: ['..'] } } },
  build: {
    format: 'file' // Generate .html files instead of directories
  }
});
