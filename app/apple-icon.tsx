import { ImageResponse } from 'next/og';

// PWA 用 Apple Touch Icon 180x180 (= iOS home 用)。
// 既存 app/icon.tsx (= 32x32 favicon) と同デザイン: accent 背景 + 白文字「CP」。

export const runtime = 'edge';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 101,
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
