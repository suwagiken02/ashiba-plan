import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;
const PIN_REGEX = /^\d{4}$/;
const BIRTH_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECOVERY_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000;   // 1 hour

type RecoverPasswordBody = {
  username?: unknown;
  lastName?: unknown;
  firstName?: unknown;
  birthDate?: unknown;
  pin?: unknown;
  newPassword?: unknown;
};

/**
 * POST /api/auth/recover-password
 * PW 復旧フロー (= Day 4-5 Step 3、 機能 A)。
 *
 * フロー (= 8 ステップ):
 *   1. JSON ボディ受信 + フィールドバリデーション
 *   2. profiles から username 一致レコード取得
 *   3. ロック確認 (= recovery_locked_until > NOW())
 *   4. 名前 + 生年月日 比較
 *   5. PIN bcrypt.compare
 *   6. 全部一致: PW 更新 + attempts/locked リセット
 *   7. 部分失敗: カウンタ++ + 3 回目でロック発動
 *   8. レスポンス
 *
 * セキュリティ:
 *   - ユーザー列挙防止: 候補なし時も「情報が一致しません」 で統一
 *   - PW 更新は supabaseAdmin.auth.admin.updateUserById (= Service Role Key)
 *   - PIN は bcrypt 比較 (= 平文保存なし)
 */
export async function POST(request: Request) {
  // Step 1: JSON ボディ受信 + バリデーション
  let body: RecoverPasswordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username : null;
  const lastName = typeof body.lastName === 'string' ? body.lastName : null;
  const firstName = typeof body.firstName === 'string' ? body.firstName : null;
  const birthDate = typeof body.birthDate === 'string' ? body.birthDate : null;
  const pin = typeof body.pin === 'string' ? body.pin : null;
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : null;

  if (!username || !USERNAME_REGEX.test(username)) {
    return NextResponse.json({ error: 'ID の形式が正しくありません' }, { status: 400 });
  }
  if (!lastName || lastName.length === 0 || lastName.length > 32) {
    return NextResponse.json({ error: '姓は 1〜32 文字で入力してください' }, { status: 400 });
  }
  if (!firstName || firstName.length === 0 || firstName.length > 32) {
    return NextResponse.json({ error: '名は 1〜32 文字で入力してください' }, { status: 400 });
  }
  if (!birthDate || !BIRTH_DATE_REGEX.test(birthDate)) {
    return NextResponse.json({ error: '生年月日は YYYY-MM-DD 形式で入力してください' }, { status: 400 });
  }
  if (!pin || !PIN_REGEX.test(pin)) {
    return NextResponse.json({ error: 'PIN は 4 桁の数字で入力してください' }, { status: 400 });
  }
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: '新しいパスワードは 6 文字以上で入力してください' }, { status: 400 });
  }

  // Step 2: profiles から username 一致レコード取得
  const { data: profile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, last_name, first_name, birth_date, recovery_pin_hash, failed_recovery_attempts, recovery_locked_until')
    .eq('username', username)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: '復旧処理に失敗しました' }, { status: 500 });
  }
  // 候補なし → ユーザー列挙防止のため詳細は出さない
  if (!profile) {
    return NextResponse.json({ error: '情報が一致しません' }, { status: 401 });
  }

  // Step 3: ロック確認
  if (profile.recovery_locked_until && new Date(profile.recovery_locked_until) > new Date()) {
    return NextResponse.json(
      { error: 'アカウントがロックされています。 1 時間後に再度お試しください' },
      { status: 423 },
    );
  }

  // Step 4 + 5: 名前 + 生年月日 + PIN を一括検証
  const isNameMatch = profile.last_name === lastName && profile.first_name === firstName;
  const isBirthMatch = profile.birth_date === birthDate;
  let isPinMatch = false;
  if (profile.recovery_pin_hash) {
    try {
      isPinMatch = await bcrypt.compare(pin, profile.recovery_pin_hash);
    } catch {
      isPinMatch = false;
    }
  }

  const isAllMatch = isNameMatch && isBirthMatch && isPinMatch;

  if (!isAllMatch) {
    // Step 7: 部分失敗 → カウンタ++ + ロック判定
    const newAttempts = (profile.failed_recovery_attempts ?? 0) + 1;
    const shouldLock = newAttempts >= MAX_RECOVERY_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : profile.recovery_locked_until;

    await supabaseAdmin
      .from('profiles')
      .update({
        failed_recovery_attempts: newAttempts,
        recovery_locked_until: lockedUntil,
      })
      .eq('id', profile.id);

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

  // Step 6: 全部一致
  // 順序: PW 更新先 → 成功なら profiles reset (= 部分失敗時の整合性確保)
  const { error: updatePwError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
    password: newPassword,
  });
  if (updatePwError) {
    return NextResponse.json({ error: 'パスワードの更新に失敗しました' }, { status: 500 });
  }

  // PW 更新成功 → カウンタ + ロック リセット
  await supabaseAdmin
    .from('profiles')
    .update({
      failed_recovery_attempts: 0,
      recovery_locked_until: null,
    })
    .eq('id', profile.id);

  // Step 8: 成功
  return NextResponse.json({ message: 'パスワードを更新しました' }, { status: 200 });
}
