"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import Swal from "sweetalert2";

type VsLogoutButtonProps = {
  className?: string;
};

export function VsLogoutButton({ className }: VsLogoutButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogout = async () => {
    if (isSubmitting) {
      return;
    }

    const confirmed = await Swal.fire({
      icon: "question",
      title: "Đăng xuất?",
      text: "Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý đăng xuất",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      cancelButtonColor: "#767684",
    });

    if (!confirmed.isConfirmed) {
      return;
    }

    setIsSubmitting(true);

    void Swal.fire({
      title: "Đang đăng xuất",
      text: "Vui lòng chờ trong giây lát.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      await signOut({
        callbackUrl: "/",
      });
    } catch {
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Không thể đăng xuất",
        text: "Vui lòng thử lại.",
        confirmButtonText: "Đóng",
        confirmButtonColor: "#00003c",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className={
        className ??
        "rounded-lg border border-[color:rgba(198,197,213,0.5)] px-3 py-2 text-xs font-semibold tracking-[0.04em] text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {isSubmitting ? "Đăng xuất..." : "Đăng xuất"}
    </button>
  );
}
