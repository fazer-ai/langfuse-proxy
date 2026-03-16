import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/client/lib/utils";

interface ModalProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  zIndex?: number;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Modal({
  children,
  isOpen,
  onClose,
  title,
  footer,
  size = "md",
  className,
  zIndex = 50,
}: ModalProps) {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [handleKeyDown, isOpen]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (
      mouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose();
    }
    mouseDownTarget.current = null;
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        className={cn(
          "relative flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-xl border border-border bg-bg-secondary",
          sizeClasses[size],
          className,
        )}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-border border-b px-6 py-4">
            <h2 className="font-semibold text-text-primary text-xl">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div
          className={cn("flex-1 overflow-y-auto", {
            "px-6 py-4": !!title,
          })}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-border border-t px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
