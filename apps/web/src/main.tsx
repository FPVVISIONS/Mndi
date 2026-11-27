// Entry point. First paint comes from the inline splash in index.html; the app boots right after it,
// so the browser never waits on the framework bundle to show something.
function start(): void {
  void import('./boot');
}

requestAnimationFrame(() => setTimeout(start, 0));
