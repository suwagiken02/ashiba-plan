'use client';

type Props = {
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
  cancelLabel?: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onCancel?: () => void;
};

export default function ConfirmDialog({
  title,
  message,
  primaryLabel,
  secondaryLabel,
  cancelLabel,
  onPrimary,
  onSecondary,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 max-w-xs mx-4 w-full">
        <h2 className="text-base text-canvas font-bold mb-2">{title}</h2>
        <p className="text-sm text-dimension mb-4 leading-relaxed whitespace-pre-line">{message}</p>
        <div className="space-y-2">
          <button
            onClick={onPrimary}
            className="w-full py-2 bg-accent text-white rounded-xl text-sm font-bold"
          >
            {primaryLabel}
          </button>
          <button
            onClick={onSecondary}
            className="w-full py-2 bg-red-500 text-white rounded-xl text-sm font-bold"
          >
            {secondaryLabel}
          </button>
          {cancelLabel && onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-2 text-dimension rounded-xl text-sm"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
