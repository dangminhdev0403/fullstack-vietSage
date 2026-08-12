import Swal from "sweetalert2";

export const SwalVietSage = Swal.mixin({
  customClass: {
    popup: "rounded-[2.2rem] bg-white p-7 shadow-2xl border border-gray-100 max-w-lg w-full",
    title: "text-2xl md:text-3xl font-extrabold text-[#18211d] text-center mb-3 tracking-tight",
    htmlContainer: "text-base font-medium text-gray-700 text-center mb-5 leading-relaxed",
    confirmButton:
      "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-7 text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 transition-all hover:bg-[#1a352d] cursor-pointer mx-1.5 min-w-[130px]",
    cancelButton:
      "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-base font-bold text-slate-700 transition-all hover:bg-slate-50 cursor-pointer mx-1.5 min-w-[100px]",
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
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "error" | "info";
}) {
  return SwalVietSage.fire({
    title: options.title,
    ...(options.html ? { html: options.html } : { text: options.text }),
    icon: options.icon ?? "warning",
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Xác nhận",
    cancelButtonText: options.cancelText ?? "Hủy bỏ",
  });
}
