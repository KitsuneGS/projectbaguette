import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html', // 👈 required for SPA routing
      strict: false
    }),
    paths: {
      base: '/projectbaguette'
    }
  }
};

export default config;