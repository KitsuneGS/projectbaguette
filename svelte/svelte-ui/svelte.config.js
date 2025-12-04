import adapter from '@sveltejs/adapter-static';

const config = {
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		paths: {
			base: '/projectbaguette'
		},
		prerender: {
			handleMissingId: 'ignore'
		}
	}
};

export default config;
