import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { VitePWA } from 'vite-plugin-pwa';

const envHostList = ((process.env.VITE_ALLOWED_HOSTS ?? '') as string)
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const allowedHosts = Array.from(
  new Set([
    'localhost',
    '127.0.0.1',
    ...envHostList,
    (process.env.APP_DOMAIN ?? '').trim(),
  ].filter(Boolean))
);

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts,
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        name: 'Kompas',
        short_name: 'Kompas',
        description: 'Kompas route planning and discovery in Ho Chi Minh City.',
        theme_color: '#004be3',
        background_color: '#f5f6f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    tsconfigPaths()
  ],
})
