import { ImageResponse } from 'next/og';

// Next.js 14 App Router の programmatic favicon。
// app/icon.tsx を default export すると Next.js が自動で /icon エンドポイント生成 +
// HTML head の <link rel="icon"> を注入する。
//
// デザイン: accent 背景 (= tailwind.config の #378ADD) + 白文字「CP」 (= CADPASSPORT 略)。
// 既存ログインボタン等の brand color と統一。

export const runtime = 'edge';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 18,
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
