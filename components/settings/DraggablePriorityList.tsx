'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useHandrailSettingsStore } from '@/stores/handrailSettingsStore';
import { HandrailLengthMm, PriorityConfig } from '@/types';

type Section = 'main' | 'sub' | 'adjust' | 'excluded';
type SeparatorKind = 'main-sub' | 'sub-adjust' | 'adjust-excluded';

type ListItem =
  | { type: 'handrail'; size: HandrailLengthMm; id: string; section: Section }
  | { type: 'separator'; kind: SeparatorKind; id: string };

const SEP_LABEL: Record<SeparatorKind, string> = {
  'main-sub': '↑ メイン ／ ↓ サブ',
  'sub-adjust': '↑ サブ ／ ↓ 調整',
  'adjust-excluded': '↑ 調整 ／ ↓ 除外',
};

const SEP_ID: Record<SeparatorKind, string> = {
  'main-sub': 'sep-main-sub',
  'sub-adjust': 'sep-sub-adjust',
  'adjust-excluded': 'sep-adjust-excluded',
};

const SECTION_BAR_COLOR: Record<Section, string> = {
  main: 'bg-blue-500',
  sub: 'bg-green-500',
  adjust: 'bg-yellow-500',
  excluded: 'bg-gray-400',
};

/** priorityConfig から表示用 ListItem 配列を組み立てる */
function buildItems(cfg: PriorityConfig): ListItem[] {
  const result: ListItem[] = [];
  const { order, mainCount, subCount, adjustCount } = cfg;
  const mainEnd = mainCount;
  const subEnd = mainCount + subCount;
  const adjustEnd = mainCount + subCount + adjustCount;

  for (let i = 0; i < order.length; i++) {
    // 境界はそのインデックスの前に挿入 (mainCount=0 なら先頭、など)
    if (i === mainEnd) result.push({ type: 'separator', kind: 'main-sub', id: SEP_ID['main-sub'] });
    if (i === subEnd) result.push({ type: 'separator', kind: 'sub-adjust', id: SEP_ID['sub-adjust'] });
    if (i === adjustEnd) result.push({ type: 'separator', kind: 'adjust-excluded', id: SEP_ID['adjust-excluded'] });

    const section: Section =
      i < mainEnd ? 'main' :
      i < subEnd ? 'sub' :
      i < adjustEnd ? 'adjust' : 'excluded';

    result.push({
      type: 'handrail',
      size: order[i],
      id: `h-${order[i]}`,
      section,
    });
  }
  // 末尾セクションの境界（order.length と一致する境界）を追加
  if (mainEnd === order.length) result.push({ type: 'separator', kind: 'main-sub', id: SEP_ID['main-sub'] });
  if (subEnd === order.length) result.push({ type: 'separator', kind: 'sub-adjust', id: SEP_ID['sub-adjust'] });
  if (adjustEnd === order.length) result.push({ type: 'separator', kind: 'adjust-excluded', id: SEP_ID['adjust-excluded'] });
  return result;
}

/** 並んだ ListItem 配列から新しい PriorityConfig を抽出 */
function extractConfig(moved: ListItem[]): PriorityConfig | null {
  // 境界線の順序チェック（追い越し禁止）
  const sepOrder: SeparatorKind[] = [];
  for (const it of moved) {
    if (it.type === 'separator') sepOrder.push(it.kind);
  }
  const expected: SeparatorKind[] = ['main-sub', 'sub-adjust', 'adjust-excluded'];
  if (
    sepOrder.length !== 3 ||
    sepOrder[0] !== expected[0] ||
    sepOrder[1] !== expected[1] ||
    sepOrder[2] !== expected[2]
  ) {
    return null;
  }

  let section: Section = 'main';
  let main = 0, sub = 0, adjust = 0;
  const newOrder: HandrailLengthMm[] = [];
  for (const it of moved) {
    if (it.type === 'separator') {
      section = it.kind === 'main-sub' ? 'sub' : it.kind === 'sub-adjust' ? 'adjust' : 'excluded';
    } else {
      newOrder.push(it.size);
      if (section === 'main') main++;
      else if (section === 'sub') sub++;
      else if (section === 'adjust') adjust++;
    }
  }
  return { order: newOrder, mainCount: main, subCount: sub, adjustCount: adjust };
}

/** 手摺行 */
function SortableRow({ size, section, enabled }: { size: HandrailLengthMm; section: Section; enabled: boolean }) {
  const id = `h-${size}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const bgClass = enabled ? 'bg-white' : 'bg-gray-200';
  const textClass = enabled ? 'text-gray-900' : 'text-gray-400';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center h-10 ${bgClass} border rounded-md overflow-hidden select-none`}
    >
      <div className={`w-1 self-stretch ${SECTION_BAR_COLOR[section]}`} />
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="ドラッグハンドル"
        className="w-8 h-10 flex items-center justify-center text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >
        ≡
      </button>
      <span className={`flex-1 text-sm font-semibold ${textClass}`}>{size}mm</span>
    </div>
  );
}

/** 境界線行 */
function SortableSeparator({ kind }: { kind: SeparatorKind }) {
  const id = SEP_ID[kind];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center h-7 bg-gray-100 rounded cursor-grab active:cursor-grabbing touch-none select-none"
    >
      <span className="w-6 h-6 flex items-center justify-center text-gray-500 opacity-50">≡</span>
      <span className="flex-1 text-xs text-gray-600 font-medium text-center pr-6">
        {SEP_LABEL[kind]}
      </span>
    </div>
  );
}

export default function DraggablePriorityList() {
  const priorityConfig = useHandrailSettingsStore((s) => s.priorityConfig);
  const enabledSizes = useHandrailSettingsStore((s) => s.enabledSizes);
  const savePriorityConfig = useHandrailSettingsStore((s) => s.savePriorityConfig);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const items = buildItems(priorityConfig);
  const itemIds = items.map((it) => it.id);
  const enabledSet = new Set<HandrailLengthMm>(enabledSizes);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((it) => it.id === String(active.id));
    const newIndex = items.findIndex((it) => it.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(items, oldIndex, newIndex);
    const next = extractConfig(moved);
    if (!next) return; // 追い越し等の不変条件違反 → 変更なし (スナップバック)
    savePriorityConfig(next);
  };

  return (
    <div className="flex flex-col gap-1 max-w-sm">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((it) =>
            it.type === 'handrail'
              ? <SortableRow key={it.id} size={it.size} section={it.section} enabled={enabledSet.has(it.size)} />
              : <SortableSeparator key={it.id} kind={it.kind} />
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}
