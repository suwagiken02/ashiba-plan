import { ImageResponse } from 'next/og';

// PWA 用 192x192 icon (= Android home / manifest 必須)。
// 既存 app/icon.tsx (= 32x32 favicon) と同デザイン: accent 背景 (= #378ADD) + 白文字「CP」。

export const runtime = 'edge';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 108,
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
