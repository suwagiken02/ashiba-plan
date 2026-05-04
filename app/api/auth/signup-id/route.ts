import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Phase 0a で作成した固定 Default Company の UUID。 authStore.ts と同じ値。
// Day 7 (= shared-test-patch 解除) で会社単位の運用に再設計予定。
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;
const PIN_REGEX = /^\d{4}$/;
const BIRTH_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MIN_BIRTH_DATE = new Date('1900-01-01T00:00:00Z');

type SignupBody = {
  username?: unknown;
  password?: unknown;
  displayName?: unknown;
  birthDate?: unknown;
  pin?: unknown;
  acknowledgePinWarning?: unknown;
};

/**
 * POST /api/auth/signup-id
 * ID/PW + 4 桁 PIN サインアップ (= Day 4-5 Step 2)。
 *
 * フロー (= 8 ステップ):
 *   1. JSON ボディ受信 + 型チェック
 *   2. フィールド単位バリデーション
 *   3. PIN-生年月日 同一警告判定 (= acknowledgePinWarning で skip 可)
 *   4. supabaseAdmin.auth.admin.createUser (= 擬似メアド + email_confirm: true)
 *   5. PIN を bcrypt ハッシュ化
 *   6. profiles update (= trigger で auto insert 済の行を埋める)
 *   7. 部分失敗ロールバック (= profiles 失敗時は auth user も削除)
 *   8. 201 + { user: { id } } 返却
 */
export async function POST(request: Request) {
  // Step 1: JSON ボディ受信 + 型チェック
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が正しくありません' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username : null;
  const password = typeof body.password === 'string' ? body.password : null;
  const displayName = typeof body.displayName === 'string' ? body.displayName : null;
  const birthDate = typeof body.birthDate === 'string' ? body.birthDate : null;
  const pin = typeof body.pin === 'string' ? body.pin : null;
  const acknowledgePinWarning = body.acknowledgePinWarning === true;

  // Step 2: フィールド単位バリデーション
  if (!username || !USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      { error: 'ID は半角英数字 + アンダースコア + ハイフンの 3〜32 文字で入力してください' },
      { status: 400 },
    );
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: 'パスワードは 6 文字以上で入力してください' },
      { status: 400 },
    );
  }
  if (!displayName || displayName.length === 0 || displayName.length > 64) {
    return NextResponse.json(
      { error: '名前は 1〜64 文字で入力してください' },
      { status: 400 },
    );
  }
  if (!birthDate || !BIRTH_DATE_REGEX.test(birthDate)) {
    return NextResponse.json(
      { error: '生年月日は YYYY-MM-DD 形式で入力してください' },
      { status: 400 },
    );
  }
  const birthDateObj = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birthDateObj.getTime())) {
    return NextResponse.json({ error: '生年月日が正しくありません' }, { status: 400 });
  }
  const today = new Date();
  if (birthDateObj < MIN_BIRTH_DATE || birthDateObj > today) {
    return NextResponse.json(
      { error: '生年月日が範囲外です (1900 年以降、 今日以前)' },
      { status: 400 },
    );
  }
  if (!pin || !PIN_REGEX.test(pin)) {
    return NextResponse.json(
      { error: 'PIN は 4 桁の数字で入力してください' },
      { status: 400 },
    );
  }

  // Step 3: PIN-生年月日 同一警告判定 (= 0115 / 1501 / 1980 の 3 パターン)
  const [year, month, day] = birthDate.split('-');
  const dangerousPatterns = [`${month}${day}`, `${day}${month}`, year];
  if (dangerousPatterns.includes(pin) && !acknowledgePinWarning) {
    return NextResponse.json(
      {
        warning: 'pin-matches-birthdate',
        error: 'PIN が生年月日と同じ組み合わせです (推奨されません)',
      },
      { status: 400 },
    );
  }

  // Step 4: Supabase Auth でユーザー作成 (= 擬似メアド + email_confirm)
  const email = `${username}@cadpassport.local`;
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { auth_type: 'id-password' },
  });

  if (createError) {
    const msg = createError.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return NextResponse.json({ error: 'この ID は既に登録されています' }, { status: 409 });
    }
    return NextResponse.json({ error: 'アカウント作成に失敗しました' }, { status: 500 });
  }
  if (!createData?.user) {
    return NextResponse.json({ error: 'アカウント作成に失敗しました' }, { status: 500 });
  }

  const userId = createData.user.id;

  // Step 5: PIN を bcrypt ハッシュ化 (= salt rounds 10)
  let pinHash: string;
  try {
    pinHash = await bcrypt.hash(pin, 10);
  } catch {
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    return NextResponse.json({ error: 'アカウント作成に失敗しました' }, { status: 500 });
  }

  // Step 6: profiles update (= trigger で auto insert 済の行を埋める)
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      username,
      display_name: displayName,
      birth_date: birthDate,
      recovery_pin_hash: pinHash,
      company_id: DEFAULT_COMPANY_ID,
    })
    .eq('id', userId);

  if (updateError) {
    // Step 7: 部分失敗ロールバック (= auth user 削除 → profiles も cascade 削除)
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    if (updateError.code === '23505' || updateError.message?.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'この ID は既に登録されています' }, { status: 409 });
    }
    return NextResponse.json(
      { error: '登録の整合性が取れませんでした、 もう一度お試しください' },
      { status: 500 },
    );
  }

  // Step 8: 成功
  return NextResponse.json({ user: { id: userId } }, { status: 201 });
}
