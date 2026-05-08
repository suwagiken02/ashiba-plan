import { ImageResponse } from 'next/og';

// PWA 用 512x512 icon (= Android 高解像度 / splash screen 用)。
// 既存 app/icon.tsx (= 32x32 favicon) と同デザイン: accent 背景 + 白文字「CP」。

export const runtime = 'edge';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 288,
          background: '#378ADD',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          letterSpacing: '-0.05em',
        }}
      >
        CP
      </div>
    ),
    { ...size },
  );
}
