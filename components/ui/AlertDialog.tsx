'use client';

type Props = {
  message: string;
  onClose: () => void;
};

export default function AlertDialog({ message, onClose }: Props) {
  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs mx-4 w-full">
        <p className="text-sm text-canvas mb-4 leading-relaxed whitespace-pre-line">{message}</p>
        <button
          onClick={onClose}
          className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold"
        >
          OK
        </button>
      </div>
    </div>
  );
}
