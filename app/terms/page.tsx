'use client';

import { useRouter } from 'next/navigation';

export default function TermsPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-accent mb-2">利用規約</h1>
        <p className="text-sm text-dimension mb-6">CADパスポート / CADPASSPORT</p>

        <div className="space-y-2">
          <h2 className="text-lg font-bold mt-8 mb-3">第1章 総則</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第1条(本規約について)</h3>
          <p className="text-sm leading-relaxed">
            本利用規約(以下「本規約」といいます。)は、諏訪技建株式会社(以下「当社」といいます。)が提供する Web サービス「CADパスポート(キャドパス、英表記:CADPASSPORT)」(以下「本サービス」といいます。)の利用条件を定めるものです。
          </p>
          <p className="text-sm leading-relaxed">
            ユーザーは、本規約に同意したうえで本サービスを利用するものとします。
          </p>

          <h3 className="text-base font-bold mt-4 mb-2">第2条(サービス内容)</h3>
          <p className="text-sm leading-relaxed">
            本サービスは、足場業界向けの平面図作成・編集を行う Web アプリケーションです。
          </p>
          <p className="text-sm leading-relaxed">
            当社は、以下の機能を提供します。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>足場平面図の作成・編集</li>
            <li>図面データの保存</li>
            <li>ブラウザ上での図面閲覧</li>
            <li>その他、当社が提供する関連機能</li>
          </ul>

          <h3 className="text-base font-bold mt-4 mb-2">第3条(利用環境)</h3>
          <p className="text-sm leading-relaxed">
            本サービスは、スマートフォン・パソコン等のブラウザ環境で利用できます。
          </p>
          <p className="text-sm leading-relaxed">
            ユーザーは、自身の責任と費用において、インターネット接続環境および必要機器を準備するものとします。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第2章 アカウント</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第4条(アカウント登録)</h3>
          <p className="text-sm leading-relaxed">
            ユーザーは、当社所定の方法によりアカウント登録を行うことで、本サービスを利用できます。
          </p>
          <p className="text-sm leading-relaxed">
            登録時には、以下の情報を取得する場合があります。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>氏名</li>
            <li>メールアドレス</li>
            <li>生年月日</li>
            <li>Google アカウント情報</li>
            <li>その他、当社が必要と判断した情報</li>
          </ul>

          <h3 className="text-base font-bold mt-4 mb-2">第5条(ログイン方法)</h3>
          <p className="text-sm leading-relaxed">
            本サービスでは、以下のログイン方法を提供します。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>メールアドレス・パスワード認証</li>
            <li>Google アカウントによるログイン</li>
            <li>ID・パスワード認証</li>
          </ul>
          <p className="text-sm leading-relaxed mt-2">
            ID・パスワード認証を利用する場合、パスワード復旧用として 4 桁 PIN を設定する場合があります。PIN は安全のため、暗号化(ハッシュ化)して保存されます。
          </p>

          <h3 className="text-base font-bold mt-4 mb-2">第6条(アカウント管理)</h3>
          <p className="text-sm leading-relaxed">
            ユーザーは、自身のアカウント情報を適切に管理する責任を負います。
          </p>
          <p className="text-sm leading-relaxed">
            第三者による不正利用が疑われる場合、ユーザーは速やかに当社へ連絡するものとします。
          </p>
          <p className="text-sm leading-relaxed">
            アカウントを利用して行われた操作は、当該ユーザー本人によるものとみなします。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第3章 図面データ</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第7条(図面データの管理)</h3>
          <p className="text-sm leading-relaxed">
            ユーザーが本サービス上で作成・保存した図面データは、ユーザー自身の責任で管理するものとします。
          </p>
          <p className="text-sm leading-relaxed">
            当社は、データ保護に努めますが、以下を完全に保証するものではありません。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>データ消失が発生しないこと</li>
            <li>システム障害が発生しないこと</li>
            <li>第三者による不正アクセスが完全に防止されること</li>
          </ul>

          <h3 className="text-base font-bold mt-4 mb-2">第8条(バックアップ)</h3>
          <p className="text-sm leading-relaxed">
            本サービスはクラウド上でデータ保存を行いますが、重要な図面については、ユーザー自身でも必要に応じてバックアップを行うことを推奨します。
          </p>

          <h3 className="text-base font-bold mt-4 mb-2">第9条(知的財産権)</h3>
          <p className="text-sm leading-relaxed">
            ユーザーが作成した図面データの権利は、原則として当該ユーザーに帰属します。
          </p>
          <p className="text-sm leading-relaxed">
            ただし、当社は、本サービスの運営・改善・障害対応のために必要な範囲で、図面データへアクセスする場合があります。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第4章 禁止事項</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第10条(禁止行為)</h3>
          <p className="text-sm leading-relaxed">
            ユーザーは、以下の行為を行ってはなりません。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>法令または公序良俗に違反する行為</li>
            <li>不正アクセスやシステムへの攻撃行為</li>
            <li>他人のアカウントを利用する行為</li>
            <li>虚偽情報による登録</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>本サービスを不正目的で利用する行為</li>
            <li>第三者の権利を侵害する行為</li>
            <li>ウイルス等の有害プログラムを送信する行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ul>

          <h2 className="text-lg font-bold mt-8 mb-3">第5章 利用停止・退会</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第11条(アカウント停止)</h3>
          <p className="text-sm leading-relaxed">
            当社は、ユーザーが以下のいずれかに該当すると判断した場合、事前通知なくアカウント停止または削除を行うことがあります。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>本規約に違反した場合</li>
            <li>不正利用が確認された場合</li>
            <li>長期間利用がない場合</li>
            <li>反社会的勢力との関係が判明した場合</li>
            <li>その他、当社が運営上問題があると判断した場合</li>
          </ul>

          <h3 className="text-base font-bold mt-4 mb-2">第12条(退会)</h3>
          <p className="text-sm leading-relaxed">
            ユーザーは、当社所定の方法により退会できます。
          </p>
          <p className="text-sm leading-relaxed">
            退会後、当社は一定期間経過後にアカウント情報および図面データを削除します。
          </p>
          <p className="text-sm leading-relaxed">
            なお、法令対応・不正防止等のため、一部情報を一定期間保持する場合があります。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第6章 料金</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第13条(料金)</h3>
          <p className="text-sm leading-relaxed">
            本サービスは、現在無料で提供されています。
          </p>
          <p className="text-sm leading-relaxed">
            当社は、将来的に有料プランを導入する場合があります。
          </p>
          <p className="text-sm leading-relaxed">
            有料化する場合は、料金・支払方法・適用開始日を事前に本サービス上で通知します。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第7章 免責事項</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第14条(免責)</h3>
          <p className="text-sm leading-relaxed">
            当社は、本サービスについて、以下を保証するものではありません。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>常時利用可能であること</li>
            <li>不具合が発生しないこと</li>
            <li>特定目的への適合性</li>
            <li>データの完全保存</li>
          </ul>
          <p className="text-sm leading-relaxed mt-2">
            当社は、本サービス利用により生じた損害について、当社に故意または重大な過失がある場合を除き、責任を負いません。
          </p>

          <h3 className="text-base font-bold mt-4 mb-2">第15条(サービス変更・終了)</h3>
          <p className="text-sm leading-relaxed">
            当社は、必要に応じて本サービスの内容変更、一時停止、終了を行うことがあります。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第8章 規約変更等</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第16条(規約変更)</h3>
          <p className="text-sm leading-relaxed">
            当社は、法令改正、サービス内容変更、運営主体変更その他必要に応じて、本規約を変更できるものとします。
          </p>
          <p className="text-sm leading-relaxed">
            変更後の規約は、本サービス上に掲載した時点または別途定める効力発生日から適用されます。
          </p>

          <h3 className="text-base font-bold mt-4 mb-2">第17条(事業譲渡等)</h3>
          <p className="text-sm leading-relaxed">
            当社は、事業譲渡、組織変更等に伴い、本サービスに関する権利義務を第三者へ承継させる場合があります。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第9章 準拠法・管轄裁判所</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第18条(準拠法・管轄裁判所)</h3>
          <p className="text-sm leading-relaxed">
            本規約は日本国法を準拠法とします。
          </p>
          <p className="text-sm leading-relaxed">
            本サービスに関連する一切の紛争については、長野地方裁判所諏訪支部を第一審の専属的合意管轄裁判所とします。
          </p>

          <h2 className="text-lg font-bold mt-8 mb-3">第10章 お問い合わせ</h2>

          <h3 className="text-base font-bold mt-4 mb-2">第19条(お問い合わせ窓口)</h3>
          <p className="text-sm leading-relaxed">
            本サービスに関するお問い合わせは、以下までご連絡ください。
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>運営者:諏訪技建株式会社</li>
            <li>所在地:長野県諏訪市四賀433-1</li>
            <li>メールアドレス:suwagiken02@gmail.com</li>
          </ul>
        </div>

        <p className="mt-8 text-xs text-dimension">制定日:2026 年 5 月 7 日</p>
        <p className="text-xs text-dimension">最終改訂日:2026 年 5 月 7 日</p>

        <button
          type="button"
          onClick={() => router.back()}
          className="mt-8 w-full py-3 text-accent text-sm hover:underline"
        >
          ← 戻る
        </button>
      </div>
    </div>
  );
}
