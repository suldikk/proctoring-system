window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) {
    return;
  }

  if (event.data.type === 'PROCTORING_EXTENSION_PING') {
    window.postMessage({
      type: 'PROCTORING_EXTENSION_READY',
      extension: 'Java Proctoring Guard',
      version: '0.1.0',
    }, '*');
  }
});
