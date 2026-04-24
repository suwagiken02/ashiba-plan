'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { HandrailLengthMm, DEFAULT_ENABLED_SIZES, ALL_HANDRAIL_SIZES, PriorityConfig, DEFAULT_PRIORITY_CONFIG } from '@/types';

type HandrailSettingsStore = {
  /** 現在有効な手摺サイズ（部材パレット・自動割付で使用可能なサイズ） */
  enabledSizes: HandrailLengthMm[];
  /** 優先部材リスト設定（自動割付用） */
  priorityConfig: PriorityConfig;
  /** ロード中フラグ（初回 load 前は true） */
  loading: boolean;
  /** DB から設定を読み込む（アプリ起動時に呼ぶ） */
  loadHandrailSettings: () => Promise<void>;
  /** 設定を更新して DB に保存 */
  saveHandrailSettings: (sizes: HandrailLengthMm[]) => Promise<void>;
  /** 優先部材リスト設定を保存 */
  savePriorityConfig: (config: PriorityConfig) => Promise<void>;
  /** サイズ単位のトグル（UI のスイッチから呼ぶ） */
  toggleSize: (size: HandrailLengthMm) => Promise<void>;
};

/** enabled_sizes を HandrailLengthMm[] にサニタイズ（不正な値は除去） */
function sanitize(raw: unknown): HandrailLengthMm[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ENABLED_SIZES];
  const valid = new Set<number>(ALL_HANDRAIL_SIZES);
  return raw.filter((v): v is HandrailLengthMm => typeof v === 'number' && valid.has(v));
}

/** チェック ON/OFF に応じて priorityConfig を調整
 *  - OFF: order から該当サイズを除外末尾に移動、元セクションの Count を -1
 *  - ON: 未登録なら除外末尾に追加、登録済みなら位置維持
 */
function adjustPriorityOnToggle(
  cfg: PriorityConfig,
  size: HandrailLengthMm,
  nowEnabled: boolean,
): PriorityConfig {
  const { order, mainCount, subCount, adjustCount } = cfg;
  const idx = order.indexOf(size);
  const mainEnd = mainCount;
  const subEnd = mainCount + subCount;
  const adjustEnd = mainCount + subCount + adjustCount;

  if (nowEnabled) {
    // ON
    if (idx >= 0) return cfg; // 既に order にあれば位置維持
    return {
      ...cfg,
      order: [...order, size],
    };
  }

  // OFF
  if (idx < 0) return cfg; // もともと order に無い
  let newMain = mainCount;
  let newSub = subCount;
  let newAdjust = adjustCount;
  if (idx < mainEnd) newMain--;
  else if (idx < subEnd) newSub--;
  else if (idx < adjustEnd) newAdjust--;
  // 除外セクションから OFF する場合は Count 変化なし

  const filtered = order.filter((s) => s !== size);
  return {
    order: [...filtered, size] as HandrailLengthMm[],
    mainCount: newMain,
    subCount: newSub,
    adjustCount: newAdjust,
  };
}

export const useHandrailSettingsStore = create<HandrailSettingsStore>((set, get) => ({
  enabledSizes: [...DEFAULT_ENABLED_SIZES],
  priorityConfig: { ...DEFAULT_PRIORITY_CONFIG, order: [...DEFAULT_PRIORITY_CONFIG.order] },
  loading: true,

  loadHandrailSettings: async () => {
    try {
      const { data, error } = await supabase
        .from('handrail_settings')
        .select('enabled_sizes, priority_config')
        .is('owner_id', null)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[handrailSettings] load error, using defaults:', error.message);
        set({
          enabledSizes: [...DEFAULT_ENABLED_SIZES],
          priorityConfig: { ...DEFAULT_PRIORITY_CONFIG, order: [...DEFAULT_PRIORITY_CONFIG.order] },
          loading: false,
        });
        return;
      }
      // enabled_sizes（既存ロジック）
      const enabledSizes = data?.enabled_sizes ? sanitize(data.enabled_sizes) : [...DEFAULT_ENABLED_SIZES];
      // priority_config（null/旧データなら DEFAULT フォールバック）
      const rawPc = data?.priority_config as Partial<PriorityConfig> | null | undefined;
      const priorityConfig: PriorityConfig = rawPc && Array.isArray(rawPc.order)
        ? {
            order: sanitize(rawPc.order),
            mainCount: typeof rawPc.mainCount === 'number' ? rawPc.mainCount : DEFAULT_PRIORITY_CONFIG.mainCount,
            subCount: typeof rawPc.subCount === 'number' ? rawPc.subCount : DEFAULT_PRIORITY_CONFIG.subCount,
            adjustCount: typeof rawPc.adjustCount === 'number' ? rawPc.adjustCount : DEFAULT_PRIORITY_CONFIG.adjustCount,
          }
        : { ...DEFAULT_PRIORITY_CONFIG, order: [...DEFAULT_PRIORITY_CONFIG.order] };
      set({ enabledSizes, priorityConfig, loading: false });
    } catch (e) {
      console.warn('[handrailSettings] load exception:', e);
      set({
        enabledSizes: [...DEFAULT_ENABLED_SIZES],
        priorityConfig: { ...DEFAULT_PRIORITY_CONFIG, order: [...DEFAULT_PRIORITY_CONFIG.order] },
        loading: false,
      });
    }
  },

  saveHandrailSettings: async (sizes) => {
    // ALL_HANDRAIL_SIZES の順序で並べ、重複排除
    const ordered = ALL_HANDRAIL_SIZES.filter(s => sizes.includes(s));
    set({ enabledSizes: ordered });
    try {
      // 既存レコード（owner_id=null）を update。無ければ insert。
      const { data: existing } = await supabase
        .from('handrail_settings')
        .select('id')
        .is('owner_id', null)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from('handrail_settings')
          .update({ enabled_sizes: ordered, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('handrail_settings')
          .insert({ owner_id: null, enabled_sizes: ordered });
      }
    } catch (e) {
      console.warn('[handrailSettings] save exception:', e);
    }
  },

  savePriorityConfig: async (config) => {
    // 楽観的更新: 先に state を更新して UI 即応、失敗時はログのみ
    set({ priorityConfig: { ...config, order: [...config.order] } });
    try {
      // 既存レコード（owner_id=null）を update。無ければ insert。
      const { data: existing } = await supabase
        .from('handrail_settings')
        .select('id')
        .is('owner_id', null)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from('handrail_settings')
          .update({ priority_config: config, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('handrail_settings')
          .insert({ owner_id: null, priority_config: config });
      }
    } catch (e) {
      console.warn('[handrailSettings] savePriorityConfig exception:', e);
    }
  },

  toggleSize: async (size) => {
    const { enabledSizes, priorityConfig, saveHandrailSettings, savePriorityConfig } = get();
    const wasOn = enabledSizes.includes(size);
    const next = wasOn
      ? enabledSizes.filter(s => s !== size)
      : [...enabledSizes, size];
    // 全OFF防止: 少なくとも 1 つは必ず残す
    if (next.length === 0) return;

    // priorityConfig を連動調整（OFF→除外末尾へ、ON→除外末尾に追加）
    const nextConfig = adjustPriorityOnToggle(priorityConfig, size, !wasOn);

    // 2 リクエストで保存（enabled_sizes と priority_config は別カラムのため直列 UPDATE）
    await saveHandrailSettings(next);
    if (nextConfig !== priorityConfig) {
      await savePriorityConfig(nextConfig);
    }
  },
}));
