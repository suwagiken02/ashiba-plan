import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CAD パスポート',
    short_name: 'キャドパス',
    description: 'くさび式足場の平面図をスマホで直感的に作成',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#1a1a18',
    theme_color: '#378ADD',
    lang: 'ja',
    icons: [
      { src: '/icon0', sizes: '192x192', type: 'image/png' },
      { src: '/icon1', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
