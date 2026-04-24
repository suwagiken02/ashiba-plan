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

/** 1 行アイテム */
function SortableRow({ size }: { size: HandrailLengthMm }) {
  const id = String(size);
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
      className="flex items-center h-10 bg-white border rounded-md select-none"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="ドラッグハンドル"
        className="w-8 h-10 flex items-center justify-center text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >
        ≡
      </button>
      <span className="flex-1 text-sm font-semibold text-gray-800">{size}mm</span>
    </div>
  );
}

export default function DraggablePriorityList() {
  const priorityConfig = useHandrailSettingsStore((s) => s.priorityConfig);
  const savePriorityConfig = useHandrailSettingsStore((s) => s.savePriorityConfig);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const items = priorityConfig.order.map((s) => String(s));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(priorityConfig.order, oldIndex, newIndex) as HandrailLengthMm[];
    const next: PriorityConfig = { ...priorityConfig, order: newOrder };
    savePriorityConfig(next);
  };

  return (
    <div className="flex flex-col gap-1 max-w-sm">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {priorityConfig.order.map((size) => (
            <SortableRow key={size} size={size} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
