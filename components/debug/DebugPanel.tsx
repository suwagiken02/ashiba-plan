'use client';
import React from 'react';
import { create } from 'zustand';

interface DebugStore {
  logs: string[];
  addLog: (msg: string) => void;
  clearLogs: () => void;
}

export const useDebugStore = create<DebugStore>((set) => ({
  logs: [],
  addLog: (msg) => set((s) => ({
    logs: [...s.logs.slice(-49), `${new Date().toLocaleTimeString().slice(3)} ${msg}`]
  })),
  clearLogs: () => set({ logs: [] }),
}));

export default function DebugPanel() {
  const logs = useDebugStore((s) => s.logs);
  const clearLogs = useDebugStore((s) => s.clearLogs);
  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 4,
      width: 200,
      maxHeight: 400,
      overflowY: 'auto',
      background: 'rgba(0,0,0,0.9)',
      color: '#0f0',
      fontSize: 9,
      fontFamily: 'monospace',
      padding: 6,
      borderRadius: 4,
      zIndex: 99999,
      pointerEvents: 'auto',
    }}>
      <button onClick={clearLogs} style={{ color: '#fff', fontSize: 10, padding: '4px 8px', marginBottom: 4 }}>クリア</button>
      {logs.map((log, i) => (
        <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log}</div>
      ))}
    </div>
  );
}
