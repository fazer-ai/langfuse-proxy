import { type ReactNode, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children?: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Tooltip wrapper delegates focus to interactive children */}
      <span
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children ?? (
          <span
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border font-medium text-[10px] text-text-muted"
            role="img"
            aria-label={content}
          >
            ?
          </span>
        )}
      </span>
      {visible &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-100 -mt-1.5 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-text-primary text-xs"
            style={{ top: position.top, left: position.left }}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
