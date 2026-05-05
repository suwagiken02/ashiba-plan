import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

const PIN_REGEX = /^\d{4}$/;
const BIRTH_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECOVERY_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000;   // 1 hour

/**
 * PW 検証専用の独立 anon client (= server-side のみ)。
 * - persistSession: false → server-side で session 保存しない
 * - autoRefreshToken: false → トークン更新しない
 * - signInWithPassword で「PW 一致 / 不一致」 だけを判定、 token は使わない
 * - ブラウザの session には一切影響しない (= 別 client インスタンス)
 */
const verifyClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type RecoverIdBody = {
  lastName?: unknown;
  firstName?: unknown;
  birthDate?: unknown;
  password?: unknown;
  pin?: unknown;
};

/**
 * POST /api/auth/recover-id
 * ID 復旧フロー (= Day 4-5 Step 3、 機能 B)。
 *
 * フロー (= 9 ステップ):
 *   1. JSON ボディ受信 + バリデーション
 *   2. profiles から `last_name + first_name + birth_date` 一致候補を取得
 *   3. 候補なし → 401 (= ユーザー列挙防止)
 *   4. ロック対象判定 (= 最初の候補)
 *   5. PIN 一致候補を絞り込み (= bcrypt.compare)
 *   6. PW 一致候補を verifyClient.signInWithPassword で確認
 *   7. 一致: reset + username 返す
 *   8. 失敗時: 最初の候補にカウンタ操作
 *   9. レスポンス
 *
 * セキュリティ:
 *   - ユーザー列挙防止: 候補なし時も「情報が一致しません」 で統一
 *   - PW 検証: 別 anon client (= ブラウザセッション汚染なし)
 *   - PIN は bcrypt 比較
 */
export async function POST(request: Request) {
  // Step 1: JSON ボディ受信 + バリデーション
  let body: RecoverIdBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 });
  }

  const lastName = typeof body.lastName === 'string' ? body.lastName : null;
  const firstName = typeof body.firstName === 'string' ? body.firstName : null;
  const birthDate = typeof body.birthDate === 'string' ? body.birthDate : null;
  const password = typeof body.password === 'string' ? body.password : null;
  const pin = typeof body.pin === 'string' ? body.pin : null;

  if (!lastName || lastName.length === 0 || lastName.length > 32) {
    return NextResponse.json({ error: '姓は 1〜32 文字で入力してください' }, { status: 400 });
  }
  if (!firstName || firstName.length === 0 || firstName.length > 32) {
    return NextResponse.json({ error: '名は 1〜32 文字で入力してください' }, { status: 400 });
  }
  if (!birthDate || !BIRTH_DATE_REGEX.test(birthDate)) {
    return NextResponse.json({ error: '生年月日は YYYY-MM-DD 形式で入力してください' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'パスワードは 6 文字以上で入力してください' }, { status: 400 });
  }
  if (!pin || !PIN_REGEX.test(pin)) {
    return NextResponse.json({ error: 'PIN は 4 桁の数字で入力してください' }, { status: 400 });
  }

  // Step 2: profiles から名前 + 生年月日 一致候補を取得
  const { data: candidates, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, recovery_pin_hash, failed_recovery_attempts, recovery_locked_until')
    .eq('last_name', lastName)
    .eq('first_name', firstName)
    .eq('birth_date', birthDate)
    .not('username', 'is', null);   // ID 認証ユーザーのみ対象

  if (fetchError) {
    return NextResponse.json({ error: '復旧処理に失敗しました' }, { status: 500 });
  }

  // Step 3: 候補なし → ユーザー列挙防止
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: '情報が一致しません' }, { status: 401 });
  }

  // Step 4: ロック対象判定 (= 最初の候補のみ確認、 同名同生年月日の複数登録は稀)
  const firstCandidate = candidates[0];
  if (firstCandidate.recovery_locked_until && new Date(firstCandidate.recovery_locked_until) > new Date()) {
    return NextResponse.json(
      { error: 'アカウントがロックされています。 1 時間後に再度お試しください' },
      { status: 423 },
    );
  }

  // Step 5: PIN 一致候補を絞り込み (= bcrypt.compare)
  const pinMatched = [];
  for (const c of candidates) {
    if (!c.recovery_pin_hash) continue;
    try {
      if (await bcrypt.compare(pin, c.recovery_pin_hash)) {
        pinMatched.push(c);
      }
    } catch {
      // ignore
    }
  }

  // Step 6: PW 一致候補を verifyClient.signInWithPassword で確認
  let matchedUsername: string | null = null;
  if (pinMatched.length > 0) {
    for (const c of pinMatched) {
      const email = `${c.username}@cadpassport.local`;
      const { error: signInError } = await verifyClient.auth.signInWithPassword({ email, password });
      if (!signInError) {
        matchedUsername = c.username;
        break;   // 1 件特定で十分
      }
    }
  }

  if (matchedUsername) {
    // Step 7: 一致 → カウンタリセット + username 返す
    await supabaseAdmin
      .from('profiles')
      .update({
        failed_recovery_attempts: 0,
        recovery_locked_until: null,
      })
      .eq('username', matchedUsername);

    return NextResponse.json({ username: matchedUsername }, { status: 200 });
  }

  // Step 8: 失敗 → 最初の候補にカウンタ操作 (= 同名同生年月日複数登録時の簡略化)
  const newAttempts = (firstCandidate.failed_recovery_attempts ?? 0) + 1;
  const shouldLock = newAttempts >= MAX_RECOVERY_ATTEMPTS;
  const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : firstCandidate.recovery_locked_until;

  await supabaseAdmin
    .from('profiles')
    .update({
      failed_recovery_attempts: newAttempts,
      recovery_locked_until: lockedUntil,
    })
    .eq('id', firstCandidate.id);

  // Step 9: レスポンス
  if (shouldLock) {
    return NextResponse.json(
      { error: '3 回失敗したためアカウントがロックされました。 1 時間後に再度お試しください' },
      { status: 401 },
    );
  }
  const remaining = MAX_RECOVERY_ATTEMPTS - newAttempts;
  return NextResponse.json(
    { error: `情報が一致しません (残り ${remaining} 回)` },
    { status: 401 },
  );
}
