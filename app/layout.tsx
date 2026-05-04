import type { Metadata, Viewport } from 'next';
import './globals.css';
import DarkModeInit from '@/components/DarkModeInit';
import ShowDimensionsInit from '@/components/ShowDimensionsInit';
import { DevToolsExposer } from '@/components/DevToolsExposer';

export const metadata: Metadata = {
  title: 'CAD パスポート - 足場平面図アプリ',
  description: 'くさび式足場の平面図をスマホで直感的に作成',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-dark-bg text-canvas antialiased">
        <DarkModeInit />
        <ShowDimensionsInit />
        <DevToolsExposer />
        {children}
      </body>
    </html>
  );
}
