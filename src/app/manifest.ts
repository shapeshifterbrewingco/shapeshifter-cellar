import type { MetadataRoute } from 'next'

// Makes "Add to Home Screen" give a proper app: its own icon, its own window,
// no browser bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Shapeshifter Cellar',
    short_name: 'Cellar',
    description: 'Cellar management for Shapeshifter Brewing Co',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#09434d',
    theme_color: '#09434d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
