import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({ open, onClose, title, children, maxWidth = '600px' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 flex justify-center items-center z-[100] animate-fade-in-up"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-white rounded-xl p-6 w-[90%] max-h-[80vh] overflow-y-auto"
        style={{ maxWidth }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-admin-text">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-admin-text-muted"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
