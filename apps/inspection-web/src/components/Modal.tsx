import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  /** Small lettering above the title, naming what kind of thing the dialog holds. */
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}

const FIRST_FIELD = 'input, select, textarea';
const CLOSE_KEY = 'Escape';

/**
 * A modal dialog for a short form. On opening it moves the keyboard focus to its first field; Escape and
 * the close button call onClose; on closing, the focus returns to whatever opened it.
 */
export function Modal({ title, eyebrow, onClose, children }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  // Kept in a ref so that a new callback from the parent does not re-run the effects below.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === CLOSE_KEY) onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <div className="modal-backdrop">
      <article ref={dialog} className="modal narrow" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {children}
      </article>
    </div>
  );
}
