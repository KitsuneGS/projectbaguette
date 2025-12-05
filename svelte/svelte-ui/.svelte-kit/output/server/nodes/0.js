

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.BF4iT2L4.js","_app/immutable/chunks/Y57aK0mG.js","_app/immutable/chunks/Dvv5_2ZS.js","_app/immutable/chunks/Bge8jGK3.js"];
export const stylesheets = [];
export const fonts = [];
