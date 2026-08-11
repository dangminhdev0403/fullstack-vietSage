import Swal from "sweetalert2";

export const SwalVietSage = Swal.mixin({
  customClass: {
    popup: "rounded-[2rem] bg-white p-7 shadow-2xl border border-gray-100 max-w-md w-full",
    title: "text-2xl font-bold text-gray-800 text-center mb-2",
    htmlContainer: "text-base font-medium text-gray-600 text-center mb-4 leading-relaxed",
    confirmButton:
      "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#24473d] px-6 text-sm font-bold text-white shadow-md shadow-[#24473d]/20 transition-all hover:bg-[#1a352d] cursor-pointer mx-1.5 min-w-[100px]",
    cancelButton:
      "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 cursor-pointer mx-1.5 min-w-[90px]",
    actions: "flex items-center justify-center gap-3 mt-4",
  },
  buttonsStyling: false,
  reverseButtons: false,
});

export function showSuccessAlert(title: string, text: string) {
  return SwalVietSage.fire({
    title,
    text,
    icon: "success",
    showConfirmButton: true,
    confirmButtonText: "OK",
  });
}

export function showErrorAlert(title: string, text: string) {
  return SwalVietSage.fire({
    title,
    text,
    icon: "error",
    showConfirmButton: true,
    confirmButtonText: "OK",
  });
}

export function showConfirmDialog(options: {
  title: string;
  text: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "error" | "info";
}) {
  return SwalVietSage.fire({
    title: options.title,
    text: options.text,
    icon: options.icon ?? "warning",
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Xác nhận",
    cancelButtonText: options.cancelText ?? "Hủy bỏ",
  });
}
