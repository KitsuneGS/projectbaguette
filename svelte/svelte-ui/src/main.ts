import App from './routes/+page.svelte';

new App({
  target: document.getElementById('svelte')!
});

// This lets your menu start the rhythm game later
(window as any).startRhythmGame = () => {
  import('/projectbaguette/js/main.js');
};
