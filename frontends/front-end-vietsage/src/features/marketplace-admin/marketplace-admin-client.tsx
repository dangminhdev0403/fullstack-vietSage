"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/ui/data-table";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { OneTimePasswordDialog } from "@/features/account/security/one-time-password-dialog";
import { SwalVietSage } from "@/libs/swal";
import { marketplaceAdminResource } from "./resource";
import { useMarketplaceAdminImportStore } from "./store/marketplace-admin-import-store";
import type { MarketplaceCategorySheetPreview, ServiceTenant } from "./types";
import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";

function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from(
    { length: 14 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

const inputClass =
  "w-full rounded-xl border border-[#e2d7c5] bg-[#faf6ef] px-4 py-3.5 text-base font-semibold text-[#17201b] outline-none transition-all focus:border-[#24473d] focus:bg-white focus:ring-2 focus:ring-[#24473d]/20";

const labelClass =
  "block text-sm font-bold uppercase tracking-wider text-[#69726b] mb-1.5";

const DEFAULT_PAGE_SIZE = 10;

function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    const status =
      typeof errObj.status === "number" ? errObj.status : undefined;
    const data = errObj.data as Record<string, unknown> | null;

    let serverMessage: string | undefined;
    const isRawCode = (str: string) =>
      /^[A-Z0-9_ -]+$/.test(str.trim()) && str.trim().length <= 30;

    if (data && typeof data === "object") {
      if (data.data && typeof data.data === "object") {
        const innerData = data.data as Record<string, unknown>;
        if (typeof innerData.detail === "string" && innerData.detail.trim()) {
          serverMessage = innerData.detail.trim();
        } else if (
          typeof innerData.message === "string" &&
          innerData.message.trim() &&
          !isRawCode(innerData.message)
        ) {
          serverMessage = innerData.message.trim();
        }
      }
      if (
        !serverMessage &&
        typeof data.detail === "string" &&
        data.detail.trim()
      ) {
        serverMessage = data.detail.trim();
      }
      if (
        !serverMessage &&
        typeof data.message === "string" &&
        data.message.trim() &&
        !isRawCode(data.message)
      ) {
        serverMessage = data.message.trim();
      } else if (
        !serverMessage &&
        Array.isArray(data.message) &&
        data.message.length > 0
      ) {
        serverMessage = data.message.join(", ");
      }
    }

    if (
      !serverMessage &&
      typeof errObj.message === "string" &&
      errObj.message.trim() &&
      !isRawCode(errObj.message)
    ) {
      serverMessage = errObj.message.trim();
    }

    if (serverMessage) {
      return serverMessage;
    }

    if (status === 409)
      return "Thông tin đối tác hoặc danh mục đã tồn tại trên hệ thống (Lỗi trùng lặp).";
    if (status === 404)
      return "Không tìm thấy thông tin yêu cầu.";
    if (status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    if (status === 401) return "Chưa đăng nhập hoặc phiên làm việc hết hạn.";
    if (status === 400)
      return "Yêu cầu không hợp lệ hoặc thông tin nhập chưa đúng.";
    if (status)
      return "Thao tác thất bại. Vui lòng kiểm tra lại thông tin.";
  }

  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    if (!/^[A-Z0-9_ -]+$/.test(msg)) return msg;
  }

  return fallback;
}

export function MarketplaceAdminClient() {
  const resource = marketplaceAdminResource.bind({});
  const data = useQuery({
    ...resource.queries.data.options(undefined as never),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    ...resource.mutations.mutate.options(),
    onSuccess: () => {
      data.refetch();
    },
  });

  const previewMutation = useMutation({
    ...resource.mutations.previewImport.options(),
  });

  const commitMutation = useMutation({
    ...resource.mutations.commitImport.options(),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) =>
      fetch("/api/admin/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteCategory", id }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.status === "success") {
        SwalVietSage.fire({
          title: "Đã xóa!",
          text: "Danh mục đã được xóa hẳn thành công.",
          icon: "success",
          confirmButtonText: "OK",
        });
        data.refetch();
      } else {
        SwalVietSage.fire({
          title: "Thất bại!",
          text: res.message || "Không thể xóa danh mục.",
          icon: "error",
        });
      }
    },
    onError: (err) => {
      SwalVietSage.fire({
        title: "Thất bại!",
        text: getErrorMessage(err, "Không thể xóa danh mục."),
        icon: "error",
      });
    },
  });

  const handleDeleteCategory = (cat: MarketplaceCategory) => {
    SwalVietSage.fire({
      title: "Xác nhận xóa hẳn danh mục",
      text: `Bạn có chắc chắn muốn xóa hẳn danh mục "${cat.nameVi}" (${cat.code}) không? Danh mục chỉ được xóa khi chưa có đối tác hoặc dịch vụ sử dụng. Nếu đang được sử dụng, hãy tạm tắt hoặc chuyển đối tác sang danh mục khác.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Xóa vĩnh viễn",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        deleteCategoryMutation.mutate(cat.id);
      }
    });
  };

  // Workspace View & Dialog state
  const [activeTab, setActiveTab] = useState<"partners" | "categories">(
    "partners",
  );
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingFormError, setPricingFormError] = useState<string | null>(null);
  const [editingTenant, setEditingTenant] = useState<ServiceTenant | null>(
    null,
  );
  const [editingCategory, setEditingCategory] =
    useState<MarketplaceCategory | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [resetAccountLabel, setResetAccountLabel] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formValidationError, setFormValidationError] = useState<string | null>(
    null,
  );

  // Google Sheets Import state from Zustand
  const spreadsheetUrl = useMarketplaceAdminImportStore(
    (s) => s.categorySheetUrl,
  );
  const setCategorySheetUrl = useMarketplaceAdminImportStore(
    (s) => s.setCategorySheetUrl,
  );
  const getPartnerSheetUrl = useMarketplaceAdminImportStore(
    (s) => s.getPartnerSheetUrl,
  );
  const setPartnerSheetUrl = useMarketplaceAdminImportStore(
    (s) => s.setPartnerSheetUrl,
  );

  const [sheetPreview, setSheetPreview] =
    useState<MarketplaceCategorySheetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleSpreadsheetUrlChange = (url: string) => {
    setCategorySheetUrl(url);
  };


  // Search & Pagination State
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("all");
  const [tenantPage, setTenantPage] = useState(1);
  const [tenantPageSize, setTenantPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [categorySearch, setCategorySearch] = useState("");
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryPageSize, setCategoryPageSize] = useState(DEFAULT_PAGE_SIZE);

  const handlePreviewSheet = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!spreadsheetUrl.trim()) return;
    setPreviewError(null);
    previewMutation.mutate(
      { spreadsheetUrl: spreadsheetUrl.trim() },
      {
        onSuccess: (resData) => {
          setSheetPreview(resData);
        },
        onError: (err) => {
          setSheetPreview(null);
          setPreviewError(
            getErrorMessage(
              err,
              "Không thể xem trước dữ liệu từ Google Sheets",
            ),
          );
        },
      },
    );
  };

  const handleCommitSheet = () => {
    if (!sheetPreview || !spreadsheetUrl.trim()) return;
    if (sheetPreview.summary.errors > 0) return;

    const creates =
      sheetPreview.summary.creates ??
      (sheetPreview.summary as Record<string, number>).create ??
      0;
    const updates =
      sheetPreview.summary.updates ??
      (sheetPreview.summary as Record<string, number>).update ??
      0;
    const disables =
      sheetPreview.summary.disables ??
      sheetPreview.summary.disable ??
      (sheetPreview.summary as Record<string, number>).disable ??
      0;

    SwalVietSage.fire({
      title: "Xác nhận áp dụng thay đổi",
      text: `Bạn có chắc chắn muốn áp dụng (${creates} tạo mới, ${updates} cập nhật, ${disables} gỡ bỏ/tắt) từ Google Sheets không?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Áp dụng thay đổi",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        commitMutation.mutate(
          {
            spreadsheetUrl: spreadsheetUrl.trim(),
            expectedHash: sheetPreview.workbookHash,
          },
          {
            onSuccess: (res) => {
              setSheetPreview(null);
              const summaryRec = res.summary as
                | Record<string, number>
                | undefined;
              const resCreates = summaryRec?.creates ?? summaryRec?.create ?? 0;
              const resUpdates = summaryRec?.updates ?? summaryRec?.update ?? 0;
              const resDisables =
                summaryRec?.disables ?? summaryRec?.disable ?? 0;

              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã nhập danh mục từ Google Sheets thành công (${resCreates} tạo mới, ${resUpdates} cập nhật, ${resDisables} gỡ bỏ/tắt).`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(
                  err,
                  "Không thể áp dụng thay đổi từ Google Sheets.",
                ),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };

  const submitCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormValidationError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const nameVi = String(form.get("nameVi") ?? "").trim();
    const nameEn = String(form.get("nameEn") ?? "").trim();
    const nameZh = String(form.get("nameZh") ?? "").trim();
    const nameKo = String(form.get("nameKo") ?? "").trim();
    const nameRu = String(form.get("nameRu") ?? "").trim();
    const nameHi = String(form.get("nameHi") ?? "").trim();

    if (!nameVi) {
      setFormValidationError("Vui lòng nhập tên tiếng Việt.");
      return;
    }

    const catList = data.data?.categories ?? [];
    if (catList.some((c) => c.nameVi.toLowerCase() === nameVi.toLowerCase())) {
      setFormValidationError(
        `Tên danh mục tiếng Việt "${nameVi}" đã tồn tại trên hệ thống.`,
      );
      return;
    }

    const translations: Record<string, string> = {};
    if (nameEn) translations.en = nameEn;
    if (nameZh) translations.zh = nameZh;
    if (nameKo) translations.ko = nameKo;
    if (nameRu) translations.ru = nameRu;
    if (nameHi) translations.hi = nameHi;

    SwalVietSage.fire({
      title: "Xác nhận tạo danh mục",
      text: `Bạn có chắc chắn muốn tạo danh mục dịch vụ mới "${nameVi}"${nameEn ? ` (${nameEn})` : ""} không?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Tạo danh mục",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        mutation.mutate(
          {
            action: "category",
            input: {
              nameVi,
              sortOrder: 0,
              isActive: true,
              ...(Object.keys(translations).length > 0 ? { translations } : {}),
            },
          },
          {
            onSuccess: () => {
              formElement.reset();
              setIsCategoryModalOpen(false);
              setFormValidationError(null);
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã tạo danh mục dịch vụ "${nameVi}" thành công.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(err, "Không thể tạo danh mục dịch vụ."),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };

  const submitUpdateCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCategory) return;
    setFormValidationError(null);
    const form = new FormData(event.currentTarget);
    const nameVi = String(form.get("nameVi") ?? "").trim();
    const nameEn = String(form.get("nameEn") ?? "").trim();
    const nameZh = String(form.get("nameZh") ?? "").trim();
    const nameKo = String(form.get("nameKo") ?? "").trim();
    const nameRu = String(form.get("nameRu") ?? "").trim();
    const nameHi = String(form.get("nameHi") ?? "").trim();

    if (!nameVi) {
      setFormValidationError("Vui lòng nhập tên tiếng Việt.");
      return;
    }

    const catList = data.data?.categories ?? [];
    const isNameViChanged =
      nameVi.toLowerCase() !== editingCategory.nameVi.toLowerCase();
    if (
      isNameViChanged &&
      catList.some(
        (c) =>
          c.id !== editingCategory.id &&
          c.nameVi.toLowerCase() === nameVi.toLowerCase(),
      )
    ) {
      setFormValidationError(
        `Tên danh mục tiếng Việt "${nameVi}" trùng với danh mục khác.`,
      );
      return;
    }

    const translations: Record<string, string> = {};
    if (nameEn) translations.en = nameEn;
    if (nameZh) translations.zh = nameZh;
    if (nameKo) translations.ko = nameKo;
    if (nameRu) translations.ru = nameRu;
    if (nameHi) translations.hi = nameHi;

    SwalVietSage.fire({
      title: "Xác nhận cập nhật danh mục",
      text: `Bạn có chắc chắn muốn lưu các thay đổi cho danh mục "${nameVi}" không?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Lưu thay đổi",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        mutation.mutate(
          {
            action: "updateCategory",
            id: editingCategory.id,
            input: {
              nameVi,
              ...(Object.keys(translations).length > 0 ? { translations } : {}),
            },
          },
          {
            onSuccess: () => {
              setEditingCategory(null);
              setFormValidationError(null);
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã cập nhật danh mục "${nameVi}" thành công.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(
                  err,
                  "Không thể cập nhật danh mục dịch vụ.",
                ),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };

  const submitTenant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormValidationError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const displayName = String(form.get("displayName")).trim();
    const fullName = String(form.get("fullName")).trim();
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const categoryId = String(form.get("categoryId") ?? "").trim();

    if (!displayName || !fullName || !email || !password || !categoryId) {
      setFormValidationError("Vui lòng điền đầy đủ các thông tin bắt buộc.");
      return;
    }

    if (password.length < 8) {
      setFormValidationError("Mật khẩu phải chứa ít nhất 8 ký tự.");
      return;
    }

    const tenantsList = data.data?.tenants ?? [];
    if (
      tenantsList.some(
        (t) =>
          (t.serviceProfile?.displayName ?? t.name).toLowerCase() ===
          displayName.toLowerCase(),
      )
    ) {
      setFormValidationError(
        `Tên thương hiệu đối tác "${displayName}" đã tồn tại trên hệ thống.`,
      );
      return;
    }
    if (
      tenantsList.some(
        (t) => t.ownerEmail?.toLowerCase() === email.toLowerCase(),
      )
    ) {
      setFormValidationError(
        `Email tài khoản quản trị "${email}" đã được đăng ký cho đối tác khác.`,
      );
      return;
    }

    SwalVietSage.fire({
      title: "Xác nhận tạo đối tác",
      text: `Bạn có chắc chắn muốn khởi tạo đối tác "${displayName}" với tài khoản owner "${email}" không?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Tạo đối tác",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        const form = new FormData(formElement);
        const spreadsheetUrl = String(form.get("spreadsheetUrl") ?? "").trim();

        mutation.mutate(
          {
            action: "tenant",
            input: {
              displayName,
              categoryId,
              googleSheetsUrl: spreadsheetUrl || undefined,
              owner: { email, fullName, password },
            },
          },
          {
            onSuccess: () => {
              formElement.reset();
              setIsTenantModalOpen(false);
              setFormValidationError(null);
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã khởi tạo đối tác dịch vụ "${displayName}" thành công.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(err, "Không thể tạo đối tác dịch vụ."),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };

  const submitUpdateTenant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTenant) return;
    setFormValidationError(null);
    const form = new FormData(event.currentTarget);

    const displayName = String(form.get("displayName")).trim();
    const fullName = String(form.get("fullName")).trim();
    const email = String(form.get("email")).trim();
    const categoryId = String(form.get("categoryId") ?? "").trim();
    const feeRateRaw = String(form.get("deliveryServiceFeeRate") ?? "").trim();
    const deliveryServiceFeeRate = feeRateRaw ? Number(feeRateRaw) : null;

    if (!displayName || !categoryId) {
      setFormValidationError("Vui lòng nhập tên thương hiệu hiển thị.");
      return;
    }

    if (deliveryServiceFeeRate !== null && (!Number.isFinite(deliveryServiceFeeRate) || deliveryServiceFeeRate < 0 || deliveryServiceFeeRate > 100)) {
      setFormValidationError("Phí dịch vụ tận nơi phải từ 0 đến 100%.");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormValidationError("Email tài khoản owner không đúng định dạng.");
      return;
    }

    if (fullName && fullName.length < 2) {
      setFormValidationError("Họ tên người quản lý phải từ 2 ký tự trở lên.");
      return;
    }

    const currentDisplayName =
      editingTenant.serviceProfile?.displayName ?? editingTenant.name;
    const currentFullName = editingTenant.ownerFullName ?? "";
    const currentEmail = editingTenant.ownerEmail ?? "";
    const currentCategoryId = editingTenant.serviceProfile?.categoryId ?? "";
    const currentFeeRate = editingTenant.serviceProfile?.deliveryServiceFeeRate == null
      ? null
      : Number(editingTenant.serviceProfile.deliveryServiceFeeRate);

    const tenantsList = data.data?.tenants ?? [];
    const isDisplayNameChanged =
      displayName.toLowerCase() !== currentDisplayName.toLowerCase();
    if (
      displayName &&
      isDisplayNameChanged &&
      tenantsList.some(
        (t) =>
          t.id !== editingTenant.id &&
          t.code !== editingTenant.code &&
          (t.serviceProfile?.displayName ?? t.name).toLowerCase() ===
            displayName.toLowerCase(),
      )
    ) {
      setFormValidationError(
        `Tên thương hiệu đối tác "${displayName}" trùng với đối tác khác.`,
      );
      return;
    }

    const isEmailChanged = email.toLowerCase() !== currentEmail.toLowerCase();
    if (
      email &&
      isEmailChanged &&
      tenantsList.some(
        (t) =>
          t.id !== editingTenant.id &&
          t.code !== editingTenant.code &&
          t.ownerEmail?.toLowerCase() === email.toLowerCase(),
      )
    ) {
      setFormValidationError(
        `Email "${email}" trùng với tài khoản owner khác.`,
      );
      return;
    }

    const spreadsheetUrl = String(form.get("spreadsheetUrl") ?? "").trim();
    const currentSpreadsheetUrl = (
      editingTenant.serviceProfile?.googleSheetsUrl ?? ""
    ).trim();
    const isSpreadsheetUrlChanged = spreadsheetUrl !== currentSpreadsheetUrl;

    const ownerData: { email?: string; fullName?: string } = {};
    if (fullName && fullName !== currentFullName) ownerData.fullName = fullName;
    if (email && email !== currentEmail) ownerData.email = email;

    const isOwnerDataChanged = Object.keys(ownerData).length > 0;
    const isProfileDataChanged =
      displayName !== currentDisplayName ||
      categoryId !== currentCategoryId ||
      deliveryServiceFeeRate !== currentFeeRate;

    SwalVietSage.fire({
      title: "Xác nhận cập nhật đối tác",
      text: `Bạn có chắc chắn muốn lưu các thay đổi cho đối tác "${editingTenant.code}" (${displayName}) không?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Lưu thay đổi",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (!result.isConfirmed) return;

      if (
        isProfileDataChanged ||
        isOwnerDataChanged ||
        isSpreadsheetUrlChanged
      ) {
        mutation.mutate(
          {
            action: "updateTenant",
            id: editingTenant.id,
            input: {
              displayName,
              categoryId,
              deliveryServiceFeeRate,
              googleSheetsUrl: spreadsheetUrl || undefined,
              ...(isOwnerDataChanged ? { owner: ownerData } : {}),
            },
          },
          {
            onSuccess: () => {
              setEditingTenant(null);
              setFormValidationError(null);
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã cập nhật thông tin đối tác "${editingTenant.code}" thành công.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(
                  err,
                  "Không thể cập nhật thông tin đối tác.",
                ),
                icon: "error",
              });
            },
          },
        );
      } else {
        setEditingTenant(null);
        setFormValidationError(null);
        SwalVietSage.fire({
          title: "Thành công!",
          text: `Đã lưu cập nhật đối tác "${editingTenant.code}" thành công.`,
          icon: "success",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
        data.refetch();
      }
    });
  };

  const handleResetTenantPassword = () => {
    if (!editingTenant) return;
    const ownerEmail = editingTenant.ownerEmail?.trim() ?? "";
    const ownerFullName = editingTenant.ownerFullName?.trim() ?? "";

    SwalVietSage.fire({
      title: "Xác nhận đặt lại mật khẩu",
      text: `Hệ thống sẽ sinh ngẫu nhiên mật khẩu mới (14 ký tự) cho đối tác "${editingTenant.name}". Bạn có chắc chắn muốn tiếp tục?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Đặt lại mật khẩu",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        const newPassword = generateTemporaryPassword();
        setIsResettingPassword(true);
        mutation.mutate(
          {
            action: "updateTenant",
            id: editingTenant.id,
            input: {
              owner: {
                password: newPassword,
                ...(ownerEmail ? { email: ownerEmail } : {}),
                ...(ownerFullName ? { fullName: ownerFullName } : {}),
              },
            },
          },
          {
            onSuccess: () => {
              setIsResettingPassword(false);
              setResetAccountLabel(
                editingTenant.serviceProfile?.displayName ?? editingTenant.name,
              );
              setGeneratedPassword(newPassword);
              setEditingTenant(null);
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Mật khẩu mới cho đối tác "${editingTenant.name}" đã được tạo.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              setIsResettingPassword(false);
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(err, "Không thể đặt lại mật khẩu."),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };

  const toggleTenantStatus = (item: ServiceTenant) => {
    const currentStatus = (
      item.serviceProfile?.status ?? "active"
    ).toLowerCase();
    const isStatusActive =
      currentStatus === "active" || currentStatus === "published";
    const nextStatus = isStatusActive ? "DISABLED" : "ACTIVE";
    const tenantName = item.serviceProfile?.displayName ?? item.name;

    SwalVietSage.fire({
      title: isStatusActive
        ? "Xác nhận tạm tắt đối tác"
        : "Xác nhận kích hoạt đối tác",
      text: `Bạn có chắc chắn muốn ${isStatusActive ? "tạm tắt hoạt động" : "kích hoạt lại"} đối tác "${tenantName}" không?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: isStatusActive ? "Tạm tắt" : "Kích hoạt",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        mutation.mutate(
          {
            action: "updateTenant",
            id: item.id,
            input: { status: nextStatus },
          },
          {
            onSuccess: () => {
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã ${isStatusActive ? "tạm tắt" : "kích hoạt"} đối tác "${tenantName}" thành công.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(
                  err,
                  "Không thể thay đổi trạng thái đối tác.",
                ),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };

  const toggleCategoryStatus = (item: MarketplaceCategory) => {
    SwalVietSage.fire({
      title: item.isActive
        ? "Xác nhận tạm tắt danh mục"
        : "Xác nhận kích hoạt danh mục",
      text: `Bạn có chắc chắn muốn ${item.isActive ? "tạm tắt" : "kích hoạt"} danh mục "${item.nameVi}" không?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: item.isActive ? "Tạm tắt" : "Kích hoạt",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (result.isConfirmed) {
        mutation.mutate(
          {
            action: "updateCategory",
            id: item.id,
            input: { isActive: !item.isActive },
          },
          {
            onSuccess: () => {
              SwalVietSage.fire({
                title: "Thành công!",
                text: `Đã ${item.isActive ? "tạm tắt" : "kích hoạt"} danh mục "${item.nameVi}" thành công.`,
                icon: "success",
                showConfirmButton: true,
                confirmButtonText: "OK",
              });
              data.refetch();
            },
            onError: (err) => {
              SwalVietSage.fire({
                title: "Thất bại!",
                text: getErrorMessage(
                  err,
                  "Không thể thay đổi trạng thái danh mục.",
                ),
                icon: "error",
              });
            },
          },
        );
      }
    });
  };


  const filteredTenants = useMemo(() => {
    const tenantsList = data.data?.tenants;
    if (!tenantsList) return [];
    return tenantsList.filter((item) => {
      const q = tenantSearch.toLowerCase().trim();
      const displayName = (
        item.serviceProfile?.displayName ?? ""
      ).toLowerCase();
      const name = item.name.toLowerCase();
      const email = (item.ownerEmail ?? "").toLowerCase();
      const code = item.code.toLowerCase();

      const matchesSearch =
        !q ||
        displayName.includes(q) ||
        name.includes(q) ||
        email.includes(q) ||
        code.includes(q);

      const status = (item.serviceProfile?.status ?? "active").toLowerCase();
      const matchesStatus =
        tenantStatusFilter === "all" ||
        (tenantStatusFilter === "active" &&
          (status === "active" || status === "published")) ||
        (tenantStatusFilter === "pending" &&
          status !== "active" &&
          status !== "published");

      return matchesSearch && matchesStatus;
    });
  }, [data.data, tenantSearch, tenantStatusFilter]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    const catList = data.data?.categories;
    if (!catList) return [];
    return catList.filter((item) => {
      const q = categorySearch.toLowerCase().trim();
      const vi = item.nameVi.toLowerCase();
      const en = (
        item.translations?.find((t) => t.locale === "en")?.name ?? ""
      ).toLowerCase();
      const code = item.code.toLowerCase();
      return !q || vi.includes(q) || en.includes(q) || code.includes(q);
    });
  }, [data.data, categorySearch]);

  const handleUpdatePricingConfig = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPricingFormError(null);
    const form = new FormData(e.currentTarget);
    const deliveryRaw = String(form.get("deliveryServiceFeeRate") ?? "").trim();
    const localMateRaw = String(form.get("localMatePlatformFeeRate") ?? "").trim();

    const deliveryVal = deliveryRaw !== "" ? Number(deliveryRaw) : undefined;
    const localMateVal = localMateRaw !== "" ? Number(localMateRaw) : undefined;

    if (
      deliveryVal !== undefined &&
      (!Number.isFinite(deliveryVal) || deliveryVal < 0 || deliveryVal > 100)
    ) {
      setPricingFormError("Phí dịch vụ tận nơi phải nằm trong khoảng từ 0% đến 100%.");
      return;
    }

    if (
      localMateVal !== undefined &&
      (!Number.isFinite(localMateVal) || localMateVal < 0 || localMateVal > 100)
    ) {
      setPricingFormError("Phí nền tảng LocalMate phải nằm trong khoảng từ 0% đến 100%.");
      return;
    }

    if (deliveryVal === undefined && localMateVal === undefined) {
      setPricingFormError("Vui lòng nhập ít nhất một mức phí hợp lệ.");
      return;
    }

    SwalVietSage.fire({
      title: "Xác nhận cập nhật biểu phí",
      text: "Bạn có chắc chắn muốn lưu thay đổi biểu phí Marketplace không? Biểu phí mới chỉ áp dụng cho các đơn hàng mới (không ảnh hưởng đơn đã tạo).",
      icon: "question",
      showCancelButton: true,
      reverseButtons: false,
      confirmButtonText: "Lưu biểu phí",
      cancelButtonText: "Hủy bỏ",
    }).then((result) => {
      if (!result.isConfirmed) return;
      const input: { deliveryServiceFeeRate?: number; localMatePlatformFeeRate?: number } = {};
      if (deliveryVal !== undefined) input.deliveryServiceFeeRate = deliveryVal;
      if (localMateVal !== undefined) input.localMatePlatformFeeRate = localMateVal;

      mutation.mutate(
        {
          action: "updatePricingConfig",
          input,
        },
        {
          onSuccess: () => {
            setIsPricingModalOpen(false);
            setPricingFormError(null);
            SwalVietSage.fire({
              title: "Thành công!",
              text: "Đã cập nhật cấu hình biểu phí Marketplace thành công.",
              icon: "success",
              showConfirmButton: true,
              confirmButtonText: "OK",
            });
          },
          onError: (err) => {
            SwalVietSage.fire({
              title: "Cập nhật thất bại",
              text: getErrorMessage(err, "Không thể cập nhật cấu hình biểu phí."),
              icon: "error",
            });
          },
        },
      );
    });
  };

  if (data.isPending) {
    return (
      <div className="flex min-h-90 flex-col items-center justify-center rounded-[1.6rem] border border-[#e8dfd1] bg-white/90 p-12 text-[#69726b] shadow-xs backdrop-blur-md">
        <VsIcon
          name="progress_activity"
          className="h-9 w-9 animate-spin text-[#24473d] mb-3 text-4xl"
        />
        <p className="text-base font-bold text-[#17201b]">
          Đang tải cấu hình đối tác dịch vụ...
        </p>
      </div>
    );
  }

  if (data.isError || !data.data) {
    return (
      <div
        role="alert"
        className="rounded-[1.4rem] border border-rose-200 bg-rose-50/90 p-6 text-rose-800 shadow-xs backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
            <VsIcon name="info" className="text-2xl" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-rose-900">
              Không thể kết nối hệ thống Marketplace
            </h3>
            <p className="text-base mt-1 text-rose-700">
              {getErrorMessage(
                data.error,
                "Không thể lấy thông tin Marketplace. Vui lòng kiểm tra quyền truy cập hoặc làm mới trang.",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { categories, tenants, pricingConfig } = data.data;
  const activeTenantsCount = tenants.filter(
    (t) =>
      (t.serviceProfile?.status ?? "active").toLowerCase() === "active" ||
      (t.serviceProfile?.status ?? "").toLowerCase() === "published",
  ).length;

  const currentDeliveryFee =
    pricingConfig?.deliveryServiceFeeRate != null
      ? Number(pricingConfig.deliveryServiceFeeRate)
      : 10;
  const currentLocalMateFee =
    pricingConfig?.localMatePlatformFeeRate != null
      ? Number(pricingConfig.localMatePlatformFeeRate)
      : 15;

  return (
    <div className="space-y-6">
      {/* Metric Summary Cards Bar */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Tổng đối tác dịch vụ",
            value: tenants.length,
            icon: "domain",
          },
          {
            label: "Đang hoạt động",
            value: `${activeTenantsCount} / ${tenants.length}`,
            icon: "verified_user",
          },
          {
            label: "Danh mục dịch vụ",
            value: categories.length,
            icon: "storefront",
          },
          {
            label: "Phí nền tảng LocalMate",
            value: `${currentLocalMateFee}%`,
            icon: "payments",
          },
        ].map((metric) => (
          <article
            key={metric.label}
            className="rounded-[1.4rem] border border-[#e8dfd1] bg-white/90 p-6 shadow-[0_16px_40px_rgba(23,32,27,0.05)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-[#69726b]">
                  {metric.label}
                </p>
                <p className="mt-2 text-4xl font-extrabold text-[#24473d]">
                  {metric.value}
                </p>
              </div>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#faf6ef] border border-[#e8dfd1] text-[#24473d]">
                <VsIcon name={metric.icon} className="text-3xl" />
              </span>
            </div>
          </article>
        ))}
      </section>

      {/* Top Search Header & Primary Action Buttons Bar */}
      <section className="rounded-[1.4rem] border border-[#e8dfd1] bg-white/90 p-6 shadow-[0_16px_40px_rgba(23,32,27,0.05)] backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          {/* Tab Switcher & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
            {/* View Tab Switcher */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dfd1] bg-[#faf6ef] p-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("partners")}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold transition-all ${
                  activeTab === "partners"
                    ? "bg-[#24473d] text-[#fff8e8] shadow-xs"
                    : "text-[#69726b] hover:text-[#17201b]"
                }`}
              >
                <span>Đối tác dịch vụ</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("categories")}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold transition-all ${
                  activeTab === "categories"
                    ? "bg-[#24473d] text-[#fff8e8] shadow-xs"
                    : "text-[#69726b] hover:text-[#17201b]"
                }`}
              >
                <span>Danh mục dịch vụ</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
                <VsIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8b948d] text-xl"
                />
                <input
                  type="search"
                  value={activeTab === "partners" ? tenantSearch : categorySearch}
                  onChange={(event) => {
                    if (activeTab === "partners") {
                      setTenantSearch(event.target.value);
                      setTenantPage(1);
                    } else {
                      setCategorySearch(event.target.value);
                      setCategoryPage(1);
                    }
                  }}
                  placeholder={
                    activeTab === "partners"
                      ? "Tìm theo tên, email, mã đối tác..."
                      : "Tìm theo tên tiếng Việt, tiếng Anh, mã..."
                  }
                  className="w-full rounded-xl border border-[#e2d7c5] bg-[#faf6ef] pl-12 pr-4 py-3.5 text-base font-semibold text-[#17201b] outline-none transition-all focus:border-[#24473d] focus:bg-white focus:ring-2 focus:ring-[#24473d]/20"
                />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {activeTab === "partners" && (
              <select
                aria-label="Lọc trạng thái đối tác"
                value={tenantStatusFilter}
                onChange={(e) => {
                  setTenantStatusFilter(e.target.value);
                  setTenantPage(1);
                }}
                className="h-12 shrink-0 rounded-full border border-[#e2d7c5] bg-[#faf6ef] px-5 text-sm font-extrabold text-[#17201b] outline-none focus:border-[#24473d]"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="pending">Khởi tạo / Tạm ngưng</option>
              </select>
            )}

            <button
              type="button"
              onClick={() => {
                setPricingFormError(null);
                setIsPricingModalOpen(true);
              }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#dcd1bf] bg-[#fffcf7] px-5 py-3 text-sm font-bold text-[#24473d] shadow-2xs transition-all hover:border-[#24473d] hover:bg-[#f5efe4]"
            >
              <VsIcon name="tune" className="text-lg text-[#24473d]" />
              Cấu hình biểu phí
            </button>

            <button
              type="button"
              onClick={() => {
                setFormValidationError(null);
                setIsCategoryModalOpen(true);
              }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#dcd1bf] bg-[#fffcf7] px-5 py-3 text-sm font-bold text-[#24473d] shadow-2xs transition-all hover:border-[#24473d] hover:bg-[#f5efe4]"
            >
              <VsIcon name="add_circle" className="text-lg text-[#24473d]" />
              Thêm danh mục
            </button>

            <button
              type="button"
              onClick={() => {
                setFormValidationError(null);
                setIsTenantModalOpen(true);
              }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#24473d] px-6 py-3 text-sm font-bold text-[#fff8e8] shadow-md shadow-[#24473d]/20 transition-all hover:bg-[#1a352d] active:scale-98"
            >
              <VsIcon name="storefront" className="text-lg text-[#e8b363]" />
              Tạo đối tác dịch vụ
            </button>
          </div>
        </div>
      </section>


      {activeTab === "partners" && (
        <section className="space-y-6">
          {/* Primary Google Sheets Sync Card for Service Partners */}

          <div className="hidden md:block">
            <DataTable
              minWidth="920px"
              columns={[
                {
                  key: "owner",
                  header: (
                    <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                      ĐỐI TÁC DỊCH VỤ
                    </span>
                  ),
                  cell: (item: ServiceTenant) => {
                    const displayName =
                      item.serviceProfile?.displayName ?? item.name;
                    return (
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#24473d] text-base font-extrabold text-[#e8b363] shadow-xs ring-2 ring-[#e8b363]/30">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-base font-extrabold text-[#17201b]">
                            {displayName}
                          </p>
                          <p className="text-sm font-medium text-[#69726b]">
                            {item.name}
                          </p>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "ownerEmail",
                  header: (
                    <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                      TÀI KHOẢN QUẢN TRỊ
                    </span>
                  ),
                  cell: (item: ServiceTenant) => (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] text-[#24473d]">
                        <VsIcon name="person" className="text-lg" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-sans text-sm font-extrabold text-[#17201b]">
                          {item.ownerEmail ?? "Chưa thiết lập"}
                        </span>
                        {item.ownerFullName && (
                          <span className="text-xs font-semibold text-[#69726b]">
                            {item.ownerFullName}
                          </span>
                        )}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "category",
                  header: (
                    <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                      DANH MỤC
                    </span>
                  ),
                  cell: (item: ServiceTenant) => (
                    <span className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
                      {item.serviceProfile?.category?.nameVi ?? "Chưa gán"}
                    </span>
                  ),
                },
                {
                  key: "code",
                  header: (
                    <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                      MÃ MẠNG LƯỚI
                    </span>
                  ),
                  cell: (item: ServiceTenant) => (
                    <span className="inline-flex items-center gap-2 rounded-xl border border-[#eddab9] bg-[#fcf6ea] px-3.5 py-1.5 text-sm font-extrabold text-[#8c5e1a]">
                      <VsIcon
                        name="badge"
                        className="text-[#c89b4f] text-base"
                      />
                      {item.code}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: (
                    <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                      TRẠNG THÁI
                    </span>
                  ),
                  cell: (item: ServiceTenant) => {
                    const isStatusActive =
                      (
                        item.serviceProfile?.status ?? "active"
                      ).toLowerCase() === "active" ||
                      (item.serviceProfile?.status ?? "").toLowerCase() ===
                        "published";
                    return isStatusActive ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#cbe5d8] bg-[#ecf7f1] px-4 py-1.5 text-sm font-extrabold text-[#1a5d3f]">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#1a5d3f] animate-pulse"></span>
                        Hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#e2dad0] bg-[#f5efe8] px-4 py-1.5 text-sm font-extrabold text-[#6b6660]">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#8c857d]"></span>
                        Khởi tạo / Tạm tắt
                      </span>
                    );
                  },
                },
                {
                  key: "actions",
                  header: (
                    <div className="text-right text-xs font-black uppercase tracking-wider text-[#24473d]">
                      THAO TÁC
                    </div>
                  ),
                  cell: (item: ServiceTenant) => {
                    const isStatusActive =
                      (
                        item.serviceProfile?.status ?? "active"
                      ).toLowerCase() === "active" ||
                      (item.serviceProfile?.status ?? "").toLowerCase() ===
                        "published";
                    return (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFormValidationError(null);
                            setEditingTenant(item);
                          }}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#dcd1bf] bg-[#fffcf7] px-4 py-1.5 text-sm font-bold text-[#24473d] shadow-2xs transition-all hover:border-[#24473d] hover:bg-[#f5efe4]"
                        >
                          <VsIcon name="edit" className="text-base" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTenantStatus(item);
                          }}
                          disabled={mutation.isPending}
                          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold shadow-2xs transition-all ${
                            isStatusActive
                              ? "border-amber-300 bg-amber-50/60 text-amber-800 hover:border-amber-400 hover:bg-amber-100"
                              : "border-emerald-300 bg-emerald-50/60 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
                          }`}
                        >
                          <VsIcon
                            name={
                              isStatusActive ? "visibility_off" : "visibility"
                            }
                            className="text-base"
                          />
                          {isStatusActive ? "Tạm tắt" : "Kích hoạt"}
                        </button>
                      </div>
                    );
                  },
                },
              ]}
              data={filteredTenants}
              getRowKey={(item) => item.id}
              onRowClick={(item) => {
                setFormValidationError(null);
                setEditingTenant(item);
              }}
              emptyMessage="Không tìm thấy đối tác dịch vụ nào phù hợp"
              pagination={{
                page: tenantPage,
                pageSize: tenantPageSize,
                totalItems: filteredTenants.length,
                onPageChange: (p) => setTenantPage(p),
                onPageSizeChange: (s) => {
                  setTenantPageSize(s);
                  setTenantPage(1);
                },
              }}
            />
          </div>
        </section>
      )}

      {/* Secondary Management Area: Service Categories Table & Google Sheets Sync */}
      {activeTab === "categories" && (
        <section className="space-y-6">
          {/* Primary Google Sheets Batch Import Card */}
          <div className="rounded-[1.4rem] border border-[#e8dfd1] bg-white/90 p-6 shadow-[0_16px_40px_rgba(23,32,27,0.05)] backdrop-blur-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#24473d] flex items-center gap-2">
                  <VsIcon
                    name="table_chart"
                    className="text-xl text-[#24473d]"
                  />
                  Quản lý &amp; Đồng bộ qua Google Sheets / Excel Online
                </h3>
                <p className="text-xs font-semibold text-[#69726b] mt-0.5">
                  Nhập URL Google Sheets (tab &quot;categories&quot;) để xem
                  trước, đồng bộ danh mục &amp; đa ngôn ngữ tự động.
                </p>
              </div>
            </div>

            <form
              onSubmit={handlePreviewSheet}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="url"
                value={spreadsheetUrl}
                onChange={(e) => handleSpreadsheetUrlChange(e.target.value)}
                placeholder="Dán URL Google Sheets (https://docs.google.com/spreadsheets/d/...)"
                className="flex-1 rounded-xl border border-[#e2d7c5] bg-[#faf6ef] px-4 py-3 text-sm font-semibold text-[#17201b] outline-none focus:border-[#24473d] focus:bg-white"
              />
              <button
                type="submit"
                disabled={previewMutation.isPending || !spreadsheetUrl.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#24473d] px-6 py-3 text-sm font-bold text-[#fff8e8] shadow-xs hover:bg-[#1a352d] disabled:opacity-50 transition-all shrink-0"
              >
                <VsIcon
                  name={
                    previewMutation.isPending ? "progress_activity" : "preview"
                  }
                  className={`text-lg ${previewMutation.isPending ? "animate-spin" : ""}`}
                />
                {previewMutation.isPending ? "Đang xử lý..." : "Xem trước"}
              </button>
            </form>

            {previewError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 flex items-center gap-3"
              >
                <VsIcon
                  name="error"
                  className="text-xl text-rose-600 shrink-0"
                />
                <span>{previewError}</span>
              </div>
            )}

            {sheetPreview && (
              <div className="space-y-4 pt-4 border-t border-[#e8dfd1]/80">
                {/* Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-900">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Tạo mới
                    </p>
                    <p className="text-2xl font-extrabold">
                      {sheetPreview.summary.creates ??
                        sheetPreview.summary.create ??
                        0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      Cập nhật
                    </p>
                    <p className="text-2xl font-extrabold">
                      {sheetPreview.summary.updates ??
                        sheetPreview.summary.update ??
                        0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-rose-900">
                    <p className="text-xs font-bold uppercase tracking-wider text-rose-700">
                      Gỡ bỏ / Tắt
                    </p>
                    <p className="text-2xl font-extrabold">
                      {sheetPreview.summary.disables ??
                        sheetPreview.summary.disable ??
                        0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Không đổi
                    </p>
                    <p className="text-2xl font-extrabold">
                      {sheetPreview.summary.unchanged}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl border p-3 ${sheetPreview.summary.errors > 0 ? "border-rose-300 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-900"}`}
                  >
                    <p
                      className={`text-xs font-bold uppercase tracking-wider ${sheetPreview.summary.errors > 0 ? "text-rose-700" : "text-slate-600"}`}
                    >
                      Lỗi
                    </p>
                    <p className="text-2xl font-extrabold">
                      {sheetPreview.summary.errors}
                    </p>
                  </div>
                </div>

                {/* Validation Errors Table */}
                {sheetPreview.validation.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2"
                  >
                    <p className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                      <VsIcon
                        name="warning"
                        className="text-lg text-rose-600"
                      />
                      Lỗi cần xử lý trong Google Sheets (
                      {sheetPreview.validation.length} dòng):
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                      {sheetPreview.validation.map((v, idx) => (
                        <div
                          key={idx}
                          className="text-xs font-semibold text-rose-800 bg-white/80 p-2.5 rounded-lg border border-rose-200/80 flex items-start gap-2"
                        >
                          <span className="font-mono font-bold bg-rose-100 px-1.5 py-0.5 rounded shrink-0">
                            Hàng {v.row}, Cột {v.col}
                          </span>
                          <span>
                            {v.message}{" "}
                            {v.value ? `(Giá trị: "${v.value}")` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diff Table */}
                {sheetPreview.diff.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-extrabold text-[#24473d]">
                      Xem trước thay đổi ({sheetPreview.diff.length} danh mục):
                    </p>
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-[#e8dfd1] bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#faf6ef] border-b border-[#e8dfd1] text-[#69726b] font-bold uppercase">
                            <th className="p-3">Hành động</th>
                            <th className="p-3">Key</th>
                            <th className="p-3">Tên tiếng Việt</th>
                            <th className="p-3">Chi tiết thay đổi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8dfd1]/60">
                          {sheetPreview.diff.map((d, i) => (
                            <tr key={i} className="hover:bg-[#faf6ef]/50">
                              <td className="p-3 font-extrabold">
                                {d.action === "create" && (
                                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    Tạo mới
                                  </span>
                                )}
                                {d.action === "update" && (
                                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    Cập nhật
                                  </span>
                                )}
                                {d.action === "disable" && (
                                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                    Gỡ bỏ / Tắt
                                  </span>
                                )}
                                {d.action === "unchanged" && (
                                  <span className="text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                    Không đổi
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono font-bold text-[#17201b]">
                                {d.key || "—"}
                              </td>
                              <td className="p-3 font-bold text-[#17201b]">
                                {String(
                                  (
                                    d.payload as
                                      | Record<string, unknown>
                                      | undefined
                                  )?.nameVi ??
                                    d.label ??
                                    "—",
                                )}
                              </td>
                              <td className="p-3 text-[#525b54]">
                                {d.changes ? (
                                  <div className="space-y-0.5">
                                    {Object.entries(d.changes).map(
                                      ([field, change]) => (
                                        <div key={field} className="font-mono">
                                          <span className="font-bold">
                                            {field}:
                                          </span>{" "}
                                          {change.from} &rarr;{" "}
                                          <span className="font-bold text-amber-800">
                                            {change.to}
                                          </span>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Commit Action */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCommitSheet}
                    disabled={
                      commitMutation.isPending ||
                      sheetPreview.summary.errors > 0
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#24473d] px-7 py-3 text-sm font-bold text-[#fff8e8] shadow-md shadow-[#24473d]/20 hover:bg-[#1a352d] disabled:opacity-50 transition-all"
                  >
                    <VsIcon
                      name={
                        commitMutation.isPending
                          ? "progress_activity"
                          : "check_circle"
                      }
                      className={`text-lg ${commitMutation.isPending ? "animate-spin" : ""}`}
                    />
                    {commitMutation.isPending
                      ? "Đang áp dụng..."
                      : "Áp dụng thay đổi"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <DataTable
            minWidth="760px"
            columns={[
              {
                key: "nameVi",
                header: (
                  <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                    TÊN TIẾNG VIỆT
                  </span>
                ),
                cell: (item: MarketplaceCategory) => (
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#24473d] text-base font-bold text-[#e8b363]">
                      <VsIcon name="storefront" className="text-lg" />
                    </div>
                    <p className="text-base font-extrabold text-[#17201b]">
                      {item.nameVi}
                    </p>
                  </div>
                ),
              },

              {
                key: "code",
                header: (
                  <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                    MÃ DANH MỤC
                  </span>
                ),
                cell: (item: MarketplaceCategory) => (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] px-3.5 py-1.5 font-sans text-sm font-bold text-[#17201b]">
                    {item.code}
                  </span>
                ),
              },
              {
                key: "status",
                header: (
                  <span className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                    TRẠNG THÁI
                  </span>
                ),
                cell: (item: MarketplaceCategory) =>
                  item.isActive ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#cbe5d8] bg-[#ecf7f1] px-4 py-1.5 text-sm font-extrabold text-[#1a5d3f]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#1a5d3f]"></span>
                      Hoạt động
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#e2dad0] bg-[#f5efe8] px-4 py-1.5 text-sm font-extrabold text-[#6b6660]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#8c857d]"></span>
                      Tạm tắt
                    </span>
                  ),
              },
              {
                key: "actions",
                header: (
                  <div className="text-right text-xs font-black uppercase tracking-wider text-[#24473d]">
                    THAO TÁC
                  </div>
                ),
                cell: (item: MarketplaceCategory) => (
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormValidationError(null);
                        setEditingCategory(item);
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#dcd1bf] bg-[#fffcf7] px-4 py-1.5 text-sm font-bold text-[#24473d] shadow-2xs transition-all hover:border-[#24473d] hover:bg-[#f5efe4]"
                    >
                      <VsIcon name="edit" className="text-base" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategoryStatus(item);
                      }}
                      disabled={mutation.isPending}
                      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold shadow-2xs transition-all ${
                        item.isActive
                          ? "border-amber-300 bg-amber-50/60 text-amber-800 hover:border-amber-400 hover:bg-amber-100"
                          : "border-emerald-300 bg-emerald-50/60 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
                      }`}
                    >
                      <VsIcon
                        name={item.isActive ? "visibility_off" : "visibility"}
                        className="text-base"
                      />
                      {item.isActive ? "Tạm tắt" : "Kích hoạt"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(item);
                      }}
                      disabled={deleteCategoryMutation.isPending}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50/60 px-4 py-1.5 text-sm font-bold text-rose-800 shadow-2xs transition-all hover:border-rose-400 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <VsIcon
                        name="delete"
                        className="text-base text-rose-600"
                      />
                      Xóa
                    </button>
                  </div>
                ),
              },
            ]}
            data={filteredCategories}
            getRowKey={(item) => item.id}
            onRowClick={(item) => {
              setFormValidationError(null);
              setEditingCategory(item);
            }}
            emptyMessage="Chưa có danh mục dịch vụ nào được tạo"
            pagination={{
              page: categoryPage,
              pageSize: categoryPageSize,
              totalItems: filteredCategories.length,
              onPageChange: (p) => setCategoryPage(p),
              onPageSizeChange: (s) => {
                setCategoryPageSize(s);
                setCategoryPage(1);
              },
            }}
          />
        </section>
      )}

      {/* Modal 1: Create External Service Partner */}
      {isTenantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17201b]/60 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.6rem] border border-[#e8dfd1] bg-[#fffcf8] p-7 shadow-[0_24px_50px_rgba(23,32,27,0.15)] space-y-6">
            <div className="flex items-center justify-between border-b border-[#e8dfd1] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#24473d] text-[#e8b363]">
                  <VsIcon name="storefront" className="text-3xl" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-[#24473d]">
                    Thêm đối tác dịch vụ bên ngoài
                  </h2>
                  <p className="text-sm font-medium text-[#69726b]">
                    Khởi tạo đối tác cung cấp dịch vụ và tài khoản quản trị
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormValidationError(null);
                  setIsTenantModalOpen(false);
                }}
                className="rounded-full p-2 text-[#69726b] hover:bg-[#f4efe6] hover:text-[#17201b] transition-colors"
                aria-label="Đóng cửa sổ"
              >
                <VsIcon name="close" className="text-2xl" />
              </button>
            </div>

            {formValidationError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 flex items-center gap-3 shadow-xs"
              >
                <VsIcon
                  name="error"
                  className="text-xl text-rose-600 shrink-0"
                />
                <span>{formValidationError}</span>
              </div>
            )}

            <form onSubmit={submitTenant} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="modal-tenant-display-name"
                    className={labelClass}
                  >
                    Tên thương hiệu hiển thị
                  </label>
                  <input
                    id="modal-tenant-display-name"
                    required
                    name="displayName"
                    placeholder="Ví dụ: An Nhiên Spa & Wellness"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="modal-tenant-category" className={labelClass}>
                    Danh mục dịch vụ
                  </label>
                  <select
                    id="modal-tenant-category"
                    required
                    name="categoryId"
                    className={inputClass}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories
                      .filter((c) => c.isActive)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.nameVi}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="modal-owner-fullname" className={labelClass}>
                    Họ tên người quản lý
                  </label>
                  <input
                    id="modal-owner-fullname"
                    required
                    name="fullName"
                    placeholder="Ví dụ: Nguyễn Văn Ánh"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="modal-owner-email" className={labelClass}>
                    Email tài khoản Owner
                  </label>
                  <input
                    id="modal-owner-email"
                    required
                    type="email"
                    name="email"
                    placeholder="owner@annhien.vn"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="modal-tenant-sheet-url"
                    className={labelClass}
                  >
                    URL Google Sheets / Excel Online (Cấu hình đồng bộ dịch vụ
                    đối tác)
                  </label>
                  <input
                    id="modal-tenant-sheet-url"
                    type="url"
                    name="spreadsheetUrl"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-[#69726b]">
                    Super Admin dán link Google Sheets / Excel Online cấp cho
                    đối tác này để hệ thống tự động đồng bộ dịch vụ.
                  </p>
                </div>

                <div>
                  <label htmlFor="modal-owner-password" className={labelClass}>
                    Mật khẩu
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="modal-owner-password"
                      required
                      minLength={8}
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Mật khẩu..."
                      className={`${inputClass} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 text-[#8b948d] hover:text-[#17201b]"
                      aria-label={
                        showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                      }
                    >
                      <VsIcon
                        name={showPassword ? "visibility_off" : "visibility"}
                        className="text-xl"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-[#e8dfd1]">
                <button
                  type="button"
                  onClick={() => {
                    setFormValidationError(null);
                    setIsTenantModalOpen(false);
                  }}
                  className="h-12 rounded-full border border-[#dcd1bf] bg-white px-6 text-sm font-bold text-[#24473d] hover:bg-[#f5efe4] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#24473d] px-7 text-sm font-bold text-[#fff8e8] hover:bg-[#1a352d] disabled:opacity-50 transition-colors shadow-md shadow-[#24473d]/20"
                >
                  {mutation.isPending ? "Đang xử lý..." : "Tạo đối tác"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit External Service Partner */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17201b]/60 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.6rem] border border-[#e8dfd1] bg-[#fffcf8] p-7 shadow-[0_24px_50px_rgba(23,32,27,0.15)] space-y-6">
            <div className="flex items-center justify-between border-b border-[#e8dfd1] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#24473d] text-[#e8b363]">
                  <VsIcon name="edit" className="text-3xl" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-[#24473d]">
                    Cập nhật đối tác dịch vụ
                  </h2>
                  <p className="text-sm font-bold text-[#69726b]">
                    {editingTenant.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormValidationError(null);
                  setEditingTenant(null);
                }}
                className="rounded-full p-2 text-[#69726b] hover:bg-[#f4efe6] hover:text-[#17201b] transition-colors"
                aria-label="Đóng cửa sổ"
              >
                <VsIcon name="close" className="text-2xl" />
              </button>
            </div>

            {formValidationError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 flex items-center gap-3 shadow-xs"
              >
                <VsIcon
                  name="error"
                  className="text-xl text-rose-600 shrink-0"
                />
                <span>{formValidationError}</span>
              </div>
            )}

            <form onSubmit={submitUpdateTenant} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-tenant-display-name"
                  className={labelClass}
                >
                  Tên thương hiệu hiển thị
                </label>
                <input
                  id="edit-tenant-display-name"
                  required
                  name="displayName"
                  defaultValue={
                    editingTenant.serviceProfile?.displayName ??
                    editingTenant.name
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="edit-tenant-category" className={labelClass}>
                  Danh mục dịch vụ
                </label>
                <select
                  id="edit-tenant-category"
                  required
                  name="categoryId"
                  defaultValue={editingTenant.serviceProfile?.categoryId ?? ""}
                  className={inputClass}
                >
                  <option value="">-- Chọn danh mục --</option>
                  {categories
                    .filter(
                      (c) =>
                        c.isActive ||
                        c.id === editingTenant.serviceProfile?.categoryId,
                    )
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nameVi}
                        {!category.isActive ? " (Tạm tắt)" : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-owner-fullname" className={labelClass}>
                  Họ tên người quản lý
                </label>
                <input
                  id="edit-owner-fullname"
                  required
                  name="fullName"
                  defaultValue={editingTenant.ownerFullName ?? ""}
                  placeholder="Ví dụ: Nguyễn Văn Ánh"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="edit-owner-email" className={labelClass}>
                  Email tài khoản Owner
                </label>
                <input
                  id="edit-owner-email"
                  required
                  type="email"
                  name="email"
                  defaultValue={editingTenant.ownerEmail ?? ""}
                  placeholder="owner@annhien.vn"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="edit-tenant-sheet-url" className={labelClass}>
                  URL Google Sheets / Excel Online (Cấu hình đồng bộ dịch vụ đối
                  tác)
                </label>
                <input
                  id="edit-tenant-sheet-url"
                  type="url"
                  name="spreadsheetUrl"
                  defaultValue={
                    editingTenant.serviceProfile?.googleSheetsUrl ||
                    getPartnerSheetUrl(editingTenant.id, editingTenant.code)
                  }
                  onChange={(e) => {
                    const url = e.target.value.trim();
                    setPartnerSheetUrl(editingTenant.id, url);
                    setPartnerSheetUrl(editingTenant.code, url);
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[#69726b]">
                  Super Admin dán link Google Sheets / Excel Online cấp cho đối
                  tác này để hệ thống xem trước &amp; tự động đồng bộ dịch vụ.
                </p>
              </div>

              <div>
                <label htmlFor="edit-delivery-service-fee-rate" className={labelClass}>
                  Phí dịch vụ tận nơi (%)
                </label>
                <input
                  id="edit-delivery-service-fee-rate"
                  name="deliveryServiceFeeRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={editingTenant.serviceProfile?.deliveryServiceFeeRate ?? ""}
                  placeholder="Mặc định 10%"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[#69726b]">
                  Để trống dùng mức mặc định 10%. Chỉ nhập khi có thỏa thuận riêng.
                </p>
              </div>

              <div className="pt-3 border-t border-[#e8dfd1]/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold tracking-wider text-[#69726b] uppercase">
                    Đặt lại mật khẩu
                  </span>
                  <span className="text-xs font-semibold text-[#8b948d]">
                    Không bắt buộc
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleResetTenantPassword}
                  disabled={isResettingPassword || mutation.isPending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50/60 px-5 py-3 text-sm font-bold text-amber-900 transition-all hover:border-amber-400 hover:bg-amber-100 disabled:opacity-50"
                >
                  <VsIcon name="lock_reset" className="text-lg" />
                  {isResettingPassword
                    ? "Đang tạo mật khẩu..."
                    : "Tạo mật khẩu ngẫu nhiên"}
                </button>
                <p className="mt-1.5 text-xs text-[#8b948d]">
                  Hệ thống sẽ tự tạo mật khẩu mạnh 14 ký tự, hiển thị để admin
                  sao chép gửi cho đối tác.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-[#e8dfd1]">
                <button
                  type="button"
                  onClick={() => {
                    setFormValidationError(null);
                    setEditingTenant(null);
                  }}
                  className="h-12 rounded-full border border-[#dcd1bf] bg-white px-6 text-sm font-bold text-[#24473d] hover:bg-[#f5efe4] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#24473d] px-7 text-sm font-bold text-[#fff8e8] hover:bg-[#1a352d] disabled:opacity-50 transition-colors shadow-md shadow-[#24473d]/20"
                >
                  {mutation.isPending ? "Đang xử lý..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Create Service Category */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17201b]/60 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[1.6rem] border border-[#e8dfd1] bg-[#fffcf8] p-7 shadow-[0_24px_50px_rgba(23,32,27,0.15)] space-y-6">
            <div className="flex items-center justify-between border-b border-[#e8dfd1] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#24473d] text-[#e8b363]">
                  <VsIcon name="add_circle" className="text-3xl" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-[#24473d]">
                    Thêm danh mục
                  </h2>
                  <p className="text-sm font-medium text-[#69726b]">
                    Tạo phân loại dịch vụ mới trên hệ thống Marketplace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormValidationError(null);
                  setIsCategoryModalOpen(false);
                }}
                className="rounded-full p-2 text-[#69726b] hover:bg-[#f4efe6] hover:text-[#17201b] transition-colors"
                aria-label="Đóng cửa sổ"
              >
                <VsIcon name="close" className="text-2xl" />
              </button>
            </div>

            {formValidationError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 flex items-center gap-3 shadow-xs"
              >
                <VsIcon
                  name="error"
                  className="text-xl text-rose-600 shrink-0"
                />
                <span>{formValidationError}</span>
              </div>
            )}

            <form onSubmit={submitCategory} className="space-y-4">
              <div>
                <label htmlFor="modal-cat-name-vi" className={labelClass}>
                  Tên tiếng Việt
                </label>
                <input
                  id="modal-cat-name-vi"
                  required
                  name="nameVi"
                  placeholder="Ví dụ: Nhà hàng & Ẩm thực"
                  className={inputClass}
                />
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                  Tên đa ngôn ngữ khác (Tùy chọn)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="modal-cat-name-en" className={labelClass}>
                      🇬🇧 Tiếng Anh
                    </label>
                    <input
                      id="modal-cat-name-en"
                      name="nameEn"
                      placeholder="Ví dụ: Restaurant & Dining"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-cat-name-zh" className={labelClass}>
                      🇨🇳 Tiếng Trung
                    </label>
                    <input
                      id="modal-cat-name-zh"
                      name="nameZh"
                      placeholder="Ví dụ: 餐厅与美食"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-cat-name-ko" className={labelClass}>
                      🇰🇷 Tiếng Hàn
                    </label>
                    <input
                      id="modal-cat-name-ko"
                      name="nameKo"
                      placeholder="Ví dụ: 레스토랑 및 요리"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-cat-name-ru" className={labelClass}>
                      🇷🇺 Tiếng Nga
                    </label>
                    <input
                      id="modal-cat-name-ru"
                      name="nameRu"
                      placeholder="Ví dụ: Рестораны и кухня"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="modal-cat-name-hi" className={labelClass}>
                      🇮🇳 Tiếng Ấn Độ
                    </label>
                    <input
                      id="modal-cat-name-hi"
                      name="nameHi"
                      placeholder="Ví dụ: रेस्तरां और व्यंजन"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-[#e8dfd1]">
                <button
                  type="button"
                  onClick={() => {
                    setFormValidationError(null);
                    setIsCategoryModalOpen(false);
                  }}
                  className="h-12 rounded-full border border-[#dcd1bf] bg-white px-6 text-sm font-bold text-[#24473d] hover:bg-[#f5efe4] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#24473d] px-7 text-sm font-bold text-[#fff8e8] hover:bg-[#1a352d] disabled:opacity-50 transition-colors shadow-md shadow-[#24473d]/20"
                >
                  {mutation.isPending ? "Đang xử lý..." : "Tạo danh mục"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Edit Service Category */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17201b]/60 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.6rem] border border-[#e8dfd1] bg-[#fffcf8] p-7 shadow-[0_24px_50px_rgba(23,32,27,0.15)] space-y-6">
            <div className="flex items-center justify-between border-b border-[#e8dfd1] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#24473d] text-[#e8b363]">
                  <VsIcon name="edit" className="text-3xl" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-[#24473d]">
                    Cập nhật danh mục
                  </h2>
                  <p className="text-sm font-bold text-[#69726b]">
                    {editingCategory.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormValidationError(null);
                  setEditingCategory(null);
                }}
                className="rounded-full p-2 text-[#69726b] hover:bg-[#f4efe6] hover:text-[#17201b] transition-colors"
                aria-label="Đóng cửa sổ"
              >
                <VsIcon name="close" className="text-2xl" />
              </button>
            </div>

            {formValidationError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 flex items-center gap-3 shadow-xs"
              >
                <VsIcon
                  name="error"
                  className="text-xl text-rose-600 shrink-0"
                />
                <span>{formValidationError}</span>
              </div>
            )}

            <form onSubmit={submitUpdateCategory} className="space-y-4">
              <div>
                <label htmlFor="edit-cat-name-vi" className={labelClass}>
                  Tên tiếng Việt
                </label>
                <input
                  id="edit-cat-name-vi"
                  required
                  name="nameVi"
                  defaultValue={editingCategory.nameVi}
                  className={inputClass}
                />
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-xs font-black uppercase tracking-wider text-[#24473d]">
                  Tên đa ngôn ngữ khác (Tùy chọn)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-cat-name-en" className={labelClass}>
                      🇬🇧 Tiếng Anh
                    </label>
                    <input
                      id="edit-cat-name-en"
                      name="nameEn"
                      defaultValue={
                        editingCategory.translations?.find(
                          (t) => t.locale === "en",
                        )?.name ?? ""
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-cat-name-zh" className={labelClass}>
                      🇨🇳 Tiếng Trung
                    </label>
                    <input
                      id="edit-cat-name-zh"
                      name="nameZh"
                      defaultValue={
                        editingCategory.translations?.find(
                          (t) => t.locale === "zh",
                        )?.name ?? ""
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-cat-name-ko" className={labelClass}>
                      🇰🇷 Tiếng Hàn
                    </label>
                    <input
                      id="edit-cat-name-ko"
                      name="nameKo"
                      defaultValue={
                        editingCategory.translations?.find(
                          (t) => t.locale === "ko",
                        )?.name ?? ""
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-cat-name-ru" className={labelClass}>
                      🇷🇺 Tiếng Nga
                    </label>
                    <input
                      id="edit-cat-name-ru"
                      name="nameRu"
                      defaultValue={
                        editingCategory.translations?.find(
                          (t) => t.locale === "ru",
                        )?.name ?? ""
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="edit-cat-name-hi" className={labelClass}>
                      🇮🇳 Tiếng Ấn Độ
                    </label>
                    <input
                      id="edit-cat-name-hi"
                      name="nameHi"
                      defaultValue={
                        editingCategory.translations?.find(
                          (t) => t.locale === "hi",
                        )?.name ?? ""
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-[#e8dfd1]">
                <button
                  type="button"
                  onClick={() => {
                    setFormValidationError(null);
                    setEditingCategory(null);
                  }}
                  className="h-12 rounded-full border border-[#dcd1bf] bg-white px-6 text-sm font-bold text-[#24473d] hover:bg-[#f5efe4] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#24473d] px-7 text-sm font-bold text-[#fff8e8] hover:bg-[#1a352d] disabled:opacity-50 transition-colors shadow-md shadow-[#24473d]/20"
                >
                  {mutation.isPending ? "Đang xử lý..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Marketplace Pricing Configuration */}
      {isPricingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17201b]/60 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.6rem] border border-[#e8dfd1] bg-[#fffcf8] p-7 shadow-[0_24px_50px_rgba(23,32,27,0.15)] space-y-6">
            <div className="flex items-center justify-between border-b border-[#e8dfd1] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#24473d] text-[#e8b363]">
                  <VsIcon name="payments" className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[#17201b]">
                    Cấu hình biểu phí Marketplace
                  </h3>
                  <p className="text-sm font-semibold text-[#69726b]">
                    Phí nền tảng LocalMate &amp; Phí dịch vụ tận nơi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPricingFormError(null);
                  setIsPricingModalOpen(false);
                }}
                className="rounded-full p-2 text-[#69726b] hover:bg-[#f4efe6] hover:text-[#17201b] transition-colors"
                aria-label="Đóng cửa sổ"
              >
                <VsIcon name="close" className="text-2xl" />
              </button>
            </div>

            {pricingFormError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                {pricingFormError}
              </div>
            )}

            <form onSubmit={handleUpdatePricingConfig} className="space-y-5">
              <div>
                <label htmlFor="pricing-localmate-platform-fee-rate" className={labelClass}>
                  Phí nền tảng LocalMate (%)
                </label>
                <input
                  id="pricing-localmate-platform-fee-rate"
                  name="localMatePlatformFeeRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={currentLocalMateFee}
                  placeholder="Mặc định 15%"
                  className={inputClass}
                />
                <div className="mt-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <VsIcon name="info" className="text-sm text-amber-700" />
                    Doanh thu VietSage thu trước khi bàn giao hướng dẫn viên (guide).
                  </p>
                  <p className="text-amber-800">
                    Lưu ý: Thay đổi chỉ áp dụng cho các đơn hàng mới, không ảnh hưởng đến đơn hàng đã đặt trước đó (VietSage revenue collected before guide handoff; edits affect new orders only).
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="pricing-delivery-service-fee-rate" className={labelClass}>
                  Phí dịch vụ tận nơi mặc định (%)
                </label>
                <input
                  id="pricing-delivery-service-fee-rate"
                  name="deliveryServiceFeeRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={currentDeliveryFee}
                  placeholder="Mặc định 10%"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-[#69726b]">
                  Mức phí dịch vụ tận nơi mặc định toàn hệ thống, áp dụng khi đối tác không có cấu hình thỏa thuận riêng.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-[#e8dfd1]">
                <button
                  type="button"
                  onClick={() => {
                    setPricingFormError(null);
                    setIsPricingModalOpen(false);
                  }}
                  className="h-12 rounded-full border border-[#dcd1bf] bg-white px-6 text-sm font-bold text-[#24473d] hover:bg-[#f5efe4] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#24473d] px-7 text-sm font-bold text-[#fff8e8] hover:bg-[#1a352d] disabled:opacity-50 transition-colors shadow-md shadow-[#24473d]/20"
                >
                  {mutation.isPending ? "Đang lưu..." : "Lưu biểu phí"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <OneTimePasswordDialog
        temporaryPassword={generatedPassword}
        accountLabel={resetAccountLabel}
        onClose={() => {
          setGeneratedPassword(null);
          setResetAccountLabel("");
        }}
      />
    </div>
  );
}
