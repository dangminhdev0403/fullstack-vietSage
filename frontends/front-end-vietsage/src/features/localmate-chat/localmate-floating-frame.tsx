"use client";

import type { ReactNode, Ref } from "react";

export interface LocalMateFloatingFrameProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  closeAriaLabel?: string;
  dialogRef?: Ref<HTMLElement>;
  className?: string;
  children: ReactNode;
}

export function LocalMateFloatingFrame({
  isOpen,
  onClose,
  ariaLabel,
  closeAriaLabel = "Đóng",
  dialogRef,
  className = "",
  children,
}: LocalMateFloatingFrameProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose();
          }
        }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 sm:hidden cursor-pointer"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </section>
    </>
  );
}
