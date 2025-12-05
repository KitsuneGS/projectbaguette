export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "projectbaguette/_app",
	assets: new Set([".nojekyll","assets/favicon.png","robots.txt"]),
	mimeTypes: {".png":"image/png",".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.6ORL5fgO.js",app:"_app/immutable/entry/app.DGbmG3_j.js",imports:["_app/immutable/entry/start.6ORL5fgO.js","_app/immutable/chunks/Ci04vtVy.js","_app/immutable/chunks/Dvv5_2ZS.js","_app/immutable/chunks/BZEo_ilx.js","_app/immutable/entry/app.DGbmG3_j.js","_app/immutable/chunks/Dvv5_2ZS.js","_app/immutable/chunks/BLNhKJV1.js","_app/immutable/chunks/Y57aK0mG.js","_app/immutable/chunks/BZEo_ilx.js","_app/immutable/chunks/DCIbEL36.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
