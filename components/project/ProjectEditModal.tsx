'use client';
import React, { useState } from 'react';

type Props = {
  initialName: string;
  initialAddress: string;
  initialContractor: string;
  onClose: () => void;
  onSave: (data: { name: string; address: string; contractor_name: string }) => Promise<void>;
};

export default function ProjectEditModal({
  initialName, initialAddress, initialContractor, onClose, onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [contractor, setContractor] = useState(initialContractor);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        contractor_name: contractor.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-overlay" onClick={onClose} />
      <div className="relative bg-dark-surface border border-dark-border rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4">現場情報の編集</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-dimension mb-1">現場名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-dimension mb-1">住所</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-dimension mb-1">元請け様名</label>
            <input
              type="text"
              value={contractor}
              onChange={(e) => setContractor(e.target.value)}
              className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
              placeholder="○○工務店"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-dark-bg border border-dark-border rounded-lg text-dimension"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-3 bg-accent text-white font-bold rounded-lg disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
