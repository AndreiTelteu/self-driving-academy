// Finite048 adapter reuses common047 transport/export/build binding.
process.env.PBI_BROWSER_ADAPTER = 'following';
await import('./longitudinal-browser-server.mjs');
