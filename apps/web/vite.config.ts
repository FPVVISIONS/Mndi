import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The app boots through a dynamic import after first paint, so the browser would only discover its
 * chunks once the entry has run. This lists them in the HTML so they download in parallel instead,
 * without executing anything early.
 */
function preloadApp(): Plugin {
  return {
    name: 'marquee-preload-app',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const boot = Object.values(bundle).find(
          (c) => c.type === 'chunk' && c.name === 'boot' && c.fileName.endsWith('.js'),
        );
        if (!boot || boot.type !== 'chunk') return html;
        const files = new Set<string>();
        const walk = (name: string) => {
          const chunk = bundle[name];
          if (!chunk || chunk.type !== 'chunk' || files.has(name)) return;
          files.add(name);
          chunk.imports.forEach(walk);
        };
        walk(boot.fileName);
        const css = boot.viteMetadata?.importedCss ?? new Set<string>();
        const links = [
          ...[...files].map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`),
          ...[...css].map((f) => `<link rel="preload" as="style" crossorigin href="/${f}">`),
        ].join('\n    ');
        return html.replace('</head>', `    ${links}\n  </head>`);
      },
    },
  };
}

const api = process.env.MARQUEE_API ?? 'http://127.0.0.1:8787';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preloadApp(),
    VitePWA({
      // Inside the Android app the files ship with the APK; a service worker would only serve stale copies.
      disable: mode === 'android',
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Marquee',
        short_name: 'Marquee',
        description: 'Your Telegram library as movies, series and live TV.',
        theme_color: '#0b0b0c',
        background_color: '#0b0b0c',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/img\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'artwork',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': { target: api, changeOrigin: false } } },
  preview: { port: 4173, proxy: { '/api': { target: api } } },
  build: {
    target: 'es2022',
    // hls.js is its own chunk and only loads when a live HLS channel is opened.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
}));
