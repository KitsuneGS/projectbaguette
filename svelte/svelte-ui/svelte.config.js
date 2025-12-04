import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// GitHub Pages base path (project name)
			pages: 'build',
			assets: 'build'
		}),

		paths: {
			// !!! IMPORTANT for GitHub Pages (repo name)
			base: process.env.NODE_ENV === 'production' ? '/projectbaguette' : ''
		},

		prerender: {
			entries: ['*']
		}
	}
};

export default config;
