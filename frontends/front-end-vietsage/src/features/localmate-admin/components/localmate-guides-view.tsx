/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { SwalVietSage } from "@/libs/swal";
import { localMateAdminResource } from "../resource";
import type {
  CreateLocalMateGuideInput,
  LocalMateGuide,
  LocalMateStatus,
  UpdateLocalMateGuideInput,
} from "../types";

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80";

type GuideFormData = {
  id?: string;
  guideCode: string;
  fullName: string;
  phone: string;
  email: string;
  avatarUrl: string;
  status: LocalMateStatus;
  position: string;
  languages: string;
  operatingRegions: string;
  specialties: string;
  dailyRateVnd: number;
  bio: string;
  serviceLatitude: string;
  serviceLongitude: string;
};

const initialFormData: GuideFormData = {
  guideCode: "",
  fullName: "",
  phone: "",
  email: "",
  avatarUrl: DEFAULT_AVATAR,
  status: "QUALIFIED",
  position: "GUIDE",
  languages: "Tiếng Việt, Tiếng Anh",
  operatingRegions: "Hà Nội",
  specialties: "Ẩm thực phố cổ, Lịch sử văn hóa",
  dailyRateVnd: 1200000,
  bio: "",
  serviceLatitude: "",
  serviceLongitude: "",
};

export function LocalMateGuidesView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | LocalMateStatus>("ALL");
  const [positionFilter, setPositionFilter] = useState<
    "ALL" | "GUIDE" | "COORDINATOR" | "LEADER"
  >("ALL");

  // Selection
  const [selectedGuideIds, setSelectedGuideIds] = useState<Set<string>>(new Set());
  const [openMenuGuideId, setOpenMenuGuideId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<GuideFormData>(initialFormData);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close popup menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuGuideId(null);
      }
    }
    if (openMenuGuideId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuGuideId]);

  // TanStack Query Resource query
  const resource = localMateAdminResource.bind({});
  const { data, isLoading, isError, refetch } = useQuery(
    resource.queries.data.options(undefined as never),
  );

  // Mutations
  const updateQualificationMutation = useMutation(
    resource.mutations.updateQualification.options(),
  );
  const createGuideMutation = useMutation(
    resource.mutations.createGuide.options(),
  );
  const updateGuideMutation = useMutation(
    resource.mutations.updateGuide.options(),
  );
  const pairTelegramMutation = useMutation(
    resource.mutations.pairTelegram.options(),
  );
  const disconnectTelegramMutation = useMutation(
    resource.mutations.disconnectTelegram.options(),
  );

  // Telegram pairing modal state
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingGuide, setPairingGuide] = useState<LocalMateGuide | null>(null);
  const [pairingData, setPairingData] = useState<{
    pairingUrl: string;
    expiresAt: string;
    expiresInSeconds: number;
  } | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const guides: LocalMateGuide[] = useMemo(() => data?.guides ?? [], [data?.guides]);

  // Filtered guides
  const filteredGuides = useMemo(() => {
    return guides.filter((guide: LocalMateGuide) => {
      const matchesStatus = statusFilter === "ALL" || guide.status === statusFilter;
      const matchesPosition =
        positionFilter === "ALL" || (guide.position || "GUIDE") === positionFilter;

      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        guide.fullName.toLowerCase().includes(q) ||
        guide.guideCode.toLowerCase().includes(q) ||
        (guide.position && guide.position.toLowerCase().includes(q)) ||
        guide.operatingRegions.some((r: string) => r.toLowerCase().includes(q)) ||
        guide.specialties.some((s: string) => s.toLowerCase().includes(q)) ||
        (guide.phone && guide.phone.includes(q)) ||
        (guide.email && guide.email.toLowerCase().includes(q));

      return matchesStatus && matchesPosition && matchesQuery;
    });
  }, [guides, statusFilter, positionFilter, searchQuery]);

  // Statistics
  const qualifiedCount = guides.filter((g) => g.status === "QUALIFIED").length;
  const pendingCount = guides.filter((g) => g.status === "PENDING").length;
  const avgRating =
    guides.length > 0
      ? (guides.reduce((acc, g) => acc + g.rating, 0) / guides.length).toFixed(2)
      : "5.00";

  // Pagination calculation
  const totalItems = filteredGuides.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedGuides = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredGuides.slice(start, start + pageSize);
  }, [filteredGuides, safeCurrentPage, pageSize]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setFormData({
      ...initialFormData,
      guideCode: `LM-00${guides.length + 1}`,
      position: "GUIDE",
    });
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (guide: LocalMateGuide) => {
    setIsEditing(true);
    setFormData({
      id: guide.id,
      guideCode: guide.guideCode,
      fullName: guide.fullName,
      phone: guide.phone,
      email: guide.email ?? "",
      avatarUrl: guide.avatarUrl,
      status: guide.status,
      position: guide.position ?? "GUIDE",
      languages: guide.languages.join(", "),
      operatingRegions: guide.operatingRegions.join(", "),
      specialties: guide.specialties.join(", "),
      dailyRateVnd: guide.dailyRateVnd,
      bio: guide.bio ?? "",
      serviceLatitude: guide.serviceLatitude == null ? "" : String(guide.serviceLatitude),
      serviceLongitude: guide.serviceLongitude == null ? "" : String(guide.serviceLongitude),
    });
    setOpenMenuGuideId(null);
    setModalOpen(true);
  };

  // Save Guide
  const handleSaveGuide = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName.trim() || !formData.phone.trim() || !formData.avatarUrl.trim()) {
      await SwalVietSage.fire({
        title: "Thiếu thông tin",
        text: "Họ và tên, số điện thoại và ảnh đại diện là bắt buộc.",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const languages = formData.languages
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const operatingRegions = formData.operatingRegions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const specialties = formData.specialties
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (languages.length === 0 || operatingRegions.length === 0) {
      await SwalVietSage.fire({
        title: "Thiếu dữ liệu",
        text: "Vui lòng nhập ít nhất một ngôn ngữ và một khu vực hoạt động.",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const hasLatitude = formData.serviceLatitude.trim() !== "";
    const hasLongitude = formData.serviceLongitude.trim() !== "";
    const serviceLatitude = Number(formData.serviceLatitude);
    const serviceLongitude = Number(formData.serviceLongitude);
    if (
      hasLatitude !== hasLongitude ||
      (hasLatitude &&
        (!Number.isFinite(serviceLatitude) ||
          !Number.isFinite(serviceLongitude) ||
          serviceLatitude < -90 ||
          serviceLatitude > 90 ||
          serviceLongitude < -180 ||
          serviceLongitude > 180))
    ) {
      await SwalVietSage.fire({
        title: "Tọa độ chưa hợp lệ",
        text: "Vui lòng nhập đủ vĩ độ (-90 đến 90) và kinh độ (-180 đến 180).",
        icon: "warning",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    const coordinates = hasLatitude
      ? { serviceLatitude, serviceLongitude }
      : isEditing
        ? { serviceLatitude: null, serviceLongitude: null }
        : {};

    try {
      if (isEditing && formData.id) {
        const updatePayload: UpdateLocalMateGuideInput = {
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          avatarUrl: formData.avatarUrl.trim(),
          status: formData.status,
          position: formData.position || "GUIDE",
          languages,
          operatingRegions,
          specialties,
          dailyRateVnd: Number(formData.dailyRateVnd) || 1000000,
          bio: formData.bio.trim() || undefined,
          ...coordinates,
        };

        await updateGuideMutation.mutateAsync({
          guideId: formData.id,
          input: updatePayload,
        });

        await SwalVietSage.fire({
          title: "Thành công!",
          text: `Đã cập nhật hồ sơ LocalMate ${formData.fullName}.`,
          icon: "success",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      } else {
        const createPayload: CreateLocalMateGuideInput = {
          guideCode: formData.guideCode.trim() || undefined,
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          avatarUrl: formData.avatarUrl.trim(),
          status: formData.status,
          position: formData.position || "GUIDE",
          languages,
          operatingRegions,
          specialties,
          dailyRateVnd: Number(formData.dailyRateVnd) || 1000000,
          bio: formData.bio.trim() || undefined,
          ...coordinates,
        };

        const createdGuide = await createGuideMutation.mutateAsync({
          input: createPayload,
        });

        await SwalVietSage.fire({
          title: "Thành công!",
          text: createdGuide.temporaryPassword
            ? `Đã thêm ${formData.fullName}. Mật khẩu tạm thời (chỉ hiển thị một lần): ${createdGuide.temporaryPassword}`
            : `Đã thêm mới hướng dẫn viên ${formData.fullName} vào mạng lưới.`,
          icon: "success",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      }

      setModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đã xảy ra lỗi khi lưu thông tin.";
      await SwalVietSage.fire({
        title: "Lưu thất bại",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  // Toggle Qualification
  const handleToggleQualification = async (guide: LocalMateGuide) => {
    setOpenMenuGuideId(null);
    const newStatus: LocalMateStatus =
      guide.status === "QUALIFIED" ? "SUSPENDED" : "QUALIFIED";
    const actionLabel =
      newStatus === "QUALIFIED" ? "Thẩm định Qualified" : "Tạm dừng hoạt động";

    const confirmResult = await SwalVietSage.fire({
      title: `${actionLabel}?`,
      text: `Xác nhận chuyển trạng thái hướng dẫn viên ${guide.fullName} (${guide.guideCode}) sang ${newStatus}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Xác nhận",
      cancelButtonText: "Hủy",
      reverseButtons: false,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await updateQualificationMutation.mutateAsync({
        guideId: guide.id,
        status: newStatus,
      });

      await SwalVietSage.fire({
        title: "Cập nhật thành công",
        text: `Đã chuyển hướng dẫn viên ${guide.fullName} sang trạng thái ${newStatus}.`,
        icon: "success",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật trạng thái.";
      await SwalVietSage.fire({
        title: "Thao tác thất bại",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  // Telegram pairing handlers
  const handleConnectTelegram = async (guide: LocalMateGuide) => {
    setOpenMenuGuideId(null);
    setPairingGuide(guide);
    setPairingData(null);
    setCopiedLink(false);
    setIsPairingLoading(true);
    setPairingModalOpen(true);

    try {
      const res = await pairTelegramMutation.mutateAsync({ guideId: guide.id });
      setPairingData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể tạo liên kết kết nối Telegram.";
      setPairingModalOpen(false);
      await SwalVietSage.fire({
        title: "Lỗi kết nối Telegram",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIsPairingLoading(false);
    }
  };

  const handleDisconnectTelegram = async (guide: LocalMateGuide) => {
    setOpenMenuGuideId(null);
    const confirmResult = await SwalVietSage.fire({
      title: "Hủy kết nối Telegram?",
      text: `Bạn có chắc chắn muốn ngắt kết nối Telegram của hướng dẫn viên ${guide.fullName}? Hướng dẫn viên sẽ không còn nhận được thông báo chuyến đi qua bot.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Đồng ý ngắt kết nối",
      cancelButtonText: "Giữ lại",
      reverseButtons: false,
    });

    if (!confirmResult.isConfirmed) return;

    try {
      await disconnectTelegramMutation.mutateAsync({ guideId: guide.id });
      await SwalVietSage.fire({
        title: "Đã hủy kết nối",
        text: `Đã ngắt liên kết Telegram cho ${guide.fullName}.`,
        icon: "success",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể hủy kết nối Telegram.";
      await SwalVietSage.fire({
        title: "Lỗi",
        text: msg,
        icon: "error",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  };

  const handleCopyPairingLink = async () => {
    if (!pairingData?.pairingUrl) return;
    try {
      await navigator.clipboard.writeText(pairingData.pairingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleRefreshTelegramStatus = async () => {
    const refreshed = await refetch();
    if (pairingGuide) {
      const refreshedGuides = refreshed.data?.guides ?? [];
      const updated = refreshedGuides.find((g: LocalMateGuide) => g.id === pairingGuide.id);
      if (
        updated?.telegramBinding &&
        !updated.telegramBinding.revokedAt &&
        !updated.telegramBinding.blockedAt
      ) {
        setPairingModalOpen(false);
        await SwalVietSage.fire({
          title: "Kết nối Telegram thành công!",
          text: `Hướng dẫn viên ${updated.fullName} đã liên kết thành công với tài khoản Telegram. Giờ đây các thông báo đặt tour sẽ tự động chuyển về Telegram!`,
          icon: "success",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      }
    }
  };

  // Bulk selection
  const handleToggleSelectAll = () => {
    if (selectedGuideIds.size === paginatedGuides.length) {
      setSelectedGuideIds(new Set());
    } else {
      setSelectedGuideIds(new Set(paginatedGuides.map((g) => g.id)));
    }
  };

  const handleToggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedGuideIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedGuideIds(next);
  };

  const isSaving = createGuideMutation.isPending || updateGuideMutation.isPending;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-1">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#173F35]/10 text-[#173F35] shadow-xs">
              <VsIcon name="badge" className="text-2xl" />
            </span>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#142823]">
                Mạng lưới LocalMate
              </h1>
              <p className="mt-1 text-base text-[#52635A] max-w-2xl leading-relaxed">
                Quản lý hồ sơ, năng lực chuyên môn, khu vực tác nghiệp và trạng thái phê duyệt của đội ngũ hướng dẫn viên.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#173F35] to-[#245347] px-6 text-sm font-bold text-white shadow-[0_8px_20px_rgba(23,63,53,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_12px_28px_rgba(23,63,53,0.32)] active:scale-[0.98] shrink-0 cursor-pointer"
        >
          <VsIcon name="add" className="text-xl" />
          <span>Thêm LocalMate mới</span>
        </button>
      </div>

      {/* Executive Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: Tổng LocalMate */}
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(20,40,35,0.08)]">
          <div className="flex items-center justify-between text-[#5A6861]">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng nhân sự</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173F35]/10 text-[#173F35]">
              <VsIcon name="groups" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#142823] tracking-tight">{guides.length}</span>
            <span className="text-xs font-semibold text-[#5A6861]">nhân sự thực địa</span>
          </div>
        </div>

        {/* Card 2: Đạt chuẩn Qualified */}
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(20,40,35,0.08)]">
          <div className="flex items-center justify-between text-[#5A6861]">
            <span className="text-xs font-bold uppercase tracking-wider">Đạt chuẩn Qualified</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#16805C]/10 text-[#16805C]">
              <VsIcon name="verified" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#16805C] tracking-tight">{qualifiedCount}</span>
            <span className="text-xs font-semibold text-[#16805C]">sẵn sàng nhận tour</span>
          </div>
        </div>

        {/* Card 3: Chờ duyệt */}
        <div className="rounded-2xl border border-[#25483F]/12 bg-white p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(20,40,35,0.08)]">
          <div className="flex items-center justify-between text-[#5A6861]">
            <span className="text-xs font-bold uppercase tracking-wider">Hồ sơ chờ duyệt</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#C79A32]/10 text-[#C79A32]">
              <VsIcon name="pending_actions" className="text-lg" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#C79A32] tracking-tight">{pendingCount}</span>
            <span className="text-xs font-semibold text-[#C79A32]">cần xác thực</span>
          </div>
        </div>

        {/* Card 4: Đánh giá trung bình */}
        <div className="rounded-2xl border border-[#B18B26]/25 bg-gradient-to-br from-[#FFFDF8] to-[#FFF9EC] p-5 shadow-[0_4px_20px_rgba(177,139,38,0.08)]">
          <div className="flex items-center justify-between text-[#8A6A13]">
            <span className="text-xs font-bold uppercase tracking-wider">Đánh giá trung bình</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#B18B26]/15 text-[#B18B26]">
              <VsIcon name="star" className="text-lg fill-current" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#8A6A13] tracking-tight">★ {avgRating}</span>
            <span className="text-xs font-semibold text-[#8A6A13]/80">chất lượng phục vụ</span>
          </div>
        </div>
      </div>

      {/* Modern High-Capacity Toolbar */}
      <div className="rounded-2xl border border-[#25483F]/12 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(20,40,35,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[280px] flex-1">
            <VsIcon
              name="search"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-[#788880]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm kiếm LocalMate, khu vực, ngôn ngữ..."
              className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] pl-11 pr-4 text-sm font-medium text-[#142823] placeholder:text-[#788880] focus:border-[#173F35] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#173F35]/15 transition-all"
            />
          </div>

          {/* Status Filter Segmented Controls */}
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] p-1">
            {(
              [
                { key: "ALL", label: "Tất cả" },
                { key: "QUALIFIED", label: "Qualified" },
                { key: "PENDING", label: "Chờ duyệt" },
                { key: "SUSPENDED", label: "Tạm dừng" },
              ] as const
            ).map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => {
                  setStatusFilter(st.key);
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === st.key
                    ? "bg-[#173F35] text-white shadow-xs"
                    : "text-[#5A6861] hover:bg-white hover:text-[#142823]"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Position Filter Segmented Controls */}
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] p-1">
            {(
              [
                { key: "ALL", label: "Mọi vị trí" },
                { key: "GUIDE", label: "Hướng dẫn viên" },
                { key: "COORDINATOR", label: "Điều phối" },
                { key: "LEADER", label: "Trưởng nhóm" },
              ] as const
            ).map((pos) => (
              <button
                key={pos.key}
                type="button"
                onClick={() => {
                  setPositionFilter(pos.key);
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  positionFilter === pos.key
                    ? "bg-[#173F35] text-white shadow-xs"
                    : "text-[#5A6861] hover:bg-white hover:text-[#142823]"
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => refetch()}
            title="Làm mới dữ liệu"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] text-[#142823] transition-colors hover:bg-white hover:border-[#173F35] shrink-0 cursor-pointer"
          >
            <VsIcon name="refresh" className="text-xl" />
          </button>
        </div>
      </div>

      {/* Main LocalMate List Container */}
      <div className="rounded-2xl border border-[#25483F]/12 bg-white shadow-[0_12px_40px_rgba(20,40,35,0.06)] overflow-hidden">
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-[#173F35] border-t-transparent" />
            <p className="mt-4 text-sm font-bold text-[#52635A]">
              Đang tải danh sách LocalMate...
            </p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-[#C94A4A]">
            <p className="font-bold text-base">
              Không thể tải dữ liệu danh sách hướng dẫn viên.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 rounded-xl bg-[#173F35] px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#12322a] cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : filteredGuides.length === 0 ? (
          <div className="p-16 text-center text-[#52635A]">
            <VsIcon name="search" className="mx-auto text-4xl text-[#788880]/40 mb-3" />
            <p className="font-bold text-base text-[#142823]">
              Không tìm thấy hướng dẫn viên nào phù hợp
            </p>
            <p className="text-sm text-[#52635A] mt-1 max-w-md mx-auto">
              Thử tìm kiếm với tên, khu vực hoặc thay đổi bộ lọc trạng thái.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#173F35] px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#12322a] cursor-pointer"
            >
              <VsIcon name="add" className="text-lg" />
              <span>Thêm LocalMate mới</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-[#25483F]/12 bg-[#FAF7F0] text-xs font-bold uppercase tracking-wider text-[#485951]">
                  <th className="w-12 px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={
                        paginatedGuides.length > 0 &&
                        selectedGuideIds.size === paginatedGuides.length
                      }
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-[#25483F]/25 text-[#173F35] focus:ring-[#173F35] cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 min-w-[320px]">LocalMate</th>
                  <th className="px-6 py-4 min-w-[200px]">Khu vực</th>
                  <th className="px-6 py-4 min-w-[180px]">Ngôn ngữ</th>
                  <th className="px-6 py-4 min-w-[160px]">Đánh giá</th>
                  <th className="px-6 py-4 min-w-[150px]">Phí dịch vụ</th>
                  <th className="px-6 py-4 w-[100px] text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#25483F]/8">
                {paginatedGuides.map((guide) => {
                  const isSelected = selectedGuideIds.has(guide.id);

                  return (
                    <tr
                      key={guide.id}
                      onClick={() => handleOpenEditModal(guide)}
                      className={`group cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#FAF7F0]/80"
                          : "hover:bg-[#FAF7F0]/50"
                      }`}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-6 py-5 text-center"
                        onClick={(e) => handleToggleSelectRow(guide.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-[#25483F]/25 text-[#173F35] focus:ring-[#173F35] cursor-pointer"
                        />
                      </td>

                      {/* LocalMate Identity Column */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3.5">
                          <img
                            src={guide.avatarUrl}
                            alt={guide.fullName}
                            className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-2 ring-[#25483F]/10 shadow-xs"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-base text-[#142823] group-hover:text-[#173F35] transition-colors leading-snug">
                                {guide.fullName}
                              </span>
                              <span className="font-mono text-xs font-bold text-[#485951] bg-[#FAF7F0] border border-[#25483F]/12 px-2 py-0.5 rounded-md">
                                {guide.guideCode}
                              </span>

                              {/* Status Badge */}
                              {guide.status === "QUALIFIED" ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16805C]/10 border border-[#16805C]/20 px-3 py-1 text-xs font-bold text-[#16805C]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#16805C]" />
                                  Qualified
                                </span>
                              ) : guide.status === "PENDING" ? (
                                <span className="rounded-full bg-[#C79A32]/10 border border-[#C79A32]/20 px-3 py-1 text-xs font-bold text-[#C79A32]">
                                  Chờ duyệt
                                </span>
                              ) : (
                                <span className="rounded-full bg-[#C94A4A]/10 border border-[#C94A4A]/20 px-3 py-1 text-xs font-bold text-[#C94A4A]">
                                  Tạm dừng
                                </span>
                              )}

                              {/* Position Badge */}
                              {guide.position === "COORDINATOR" ? (
                                <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 border border-purple-200">
                                  Điều phối
                                </span>
                              ) : guide.position === "LEADER" ? (
                                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                                  Trưởng nhóm
                                </span>
                              ) : null}

                              {/* Telegram Binding Badge */}
                              {guide.telegramBinding &&
                              !guide.telegramBinding.revokedAt &&
                              !guide.telegramBinding.blockedAt ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 text-xs font-bold text-emerald-800"
                                  title={`Telegram Chat ID: ${guide.telegramBinding.telegramChatId}`}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Telegram đã kết nối
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConnectTelegram(guide);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-0.5 text-xs font-bold text-sky-700 transition-colors cursor-pointer"
                                  title="Bấm để kết nối Telegram"
                                >
                                  <VsIcon name="send" className="text-xs text-sky-600" />
                                  Kết nối Telegram
                                </button>
                              )}
                            </div>

                            {/* Account Email & Phone */}
                            <div className="mt-1 flex items-center gap-2 text-xs text-[#52635A]">
                              <span className="font-mono text-[#142823] font-medium">
                                ✉ {guide.user?.email || guide.email || "Chưa có tài khoản"}
                              </span>
                              <span>•</span>
                              <span>📞 {guide.phone}</span>
                            </div>

                            {/* Subtitle / Specialties */}
                            <div className="mt-0.5 text-xs text-[#788880] group-hover:text-[#173F35] font-medium transition-colors line-clamp-1">
                              {guide.specialties && guide.specialties.length > 0
                                ? guide.specialties.join(" · ")
                                : guide.bio || "Hướng dẫn viên du lịch trải nghiệm"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Areas Column */}
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1.5">
                          {guide.operatingRegions.slice(0, 2).map((reg) => (
                            <span
                              key={reg}
                              className="rounded-lg bg-[#FAF7F0] border border-[#25483F]/12 px-3 py-1 text-xs font-semibold text-[#142823]"
                            >
                              📍 {reg}
                            </span>
                          ))}
                          {guide.operatingRegions.length > 2 && (
                            <span className="rounded-lg bg-[#FAF7F0] border border-[#25483F]/12 px-2 py-1 text-xs font-semibold text-[#52635A]">
                              +{guide.operatingRegions.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Languages Column */}
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1.5">
                          {guide.languages.map((lang) => (
                            <span
                              key={lang}
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-[#142823]"
                            >
                              {lang}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Rating Column */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-[#C79A32]">
                            ★ {guide.rating.toFixed(2)}
                          </span>
                          <span className="text-xs text-[#52635A]">
                            ({guide.totalReviews} đánh giá)
                          </span>
                        </div>
                      </td>

                      {/* Daily Price Column */}
                      <td className="px-6 py-5">
                        <div className="font-black text-base text-[#173F35]">
                          {formatVnd(guide.dailyRateVnd)}
                        </div>
                        <div className="text-xs text-[#52635A]">/ ngày</div>
                      </td>

                      {/* Action Menu Column */}
                      <td
                        className="px-6 py-5 text-right relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuGuideId(
                              openMenuGuideId === guide.id ? null : guide.id,
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-[#52635A] hover:bg-[#FAF7F0] hover:text-[#142823] ml-auto transition-colors cursor-pointer"
                          title="Tùy chọn thao tác"
                        >
                          <VsIcon name="more_vert" className="text-xl" />
                        </button>

                        {/* Floating Popup Menu */}
                        {openMenuGuideId === guide.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-6 top-12 z-20 w-52 rounded-2xl border border-[#25483F]/12 bg-white p-2 shadow-2xl text-left"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(guide)}
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#142823] hover:bg-[#FAF7F0] cursor-pointer transition-colors"
                            >
                              <VsIcon name="edit" className="text-lg text-[#52635A]" />
                              <span>Chỉnh sửa hồ sơ</span>
                            </button>
                            <div className="my-1 border-t border-[#25483F]/10" />
                            <button
                              type="button"
                              onClick={() => handleToggleQualification(guide)}
                              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer transition-colors ${
                                guide.status === "QUALIFIED"
                                  ? "text-[#C94A4A] hover:bg-rose-50"
                                  : "text-[#16805C] hover:bg-emerald-50"
                              }`}
                            >
                              <VsIcon
                                name={guide.status === "QUALIFIED" ? "block" : "task_alt"}
                                className="text-lg"
                              />
                              <span>
                                {guide.status === "QUALIFIED"
                                  ? "Tạm dừng Qualified"
                                  : "Duyệt Qualified"}
                              </span>
                            </button>
                            <div className="my-1 border-t border-[#25483F]/10" />
                            {guide.telegramBinding &&
                            !guide.telegramBinding.revokedAt &&
                            !guide.telegramBinding.blockedAt ? (
                              <button
                                type="button"
                                onClick={() => handleDisconnectTelegram(guide)}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 cursor-pointer transition-colors"
                              >
                                <VsIcon name="link_off" className="text-lg text-amber-600" />
                                <span>Hủy kết nối Telegram</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConnectTelegram(guide)}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 cursor-pointer transition-colors"
                              >
                                <VsIcon name="send" className="text-lg text-sky-600" />
                                <span>Kết nối Telegram</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Pagination bar */}
        {!isLoading && filteredGuides.length > 0 && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-[#25483F]/12 bg-[#FAF7F0] px-6 py-4 text-sm font-medium text-[#52635A]">
            <div className="flex items-center gap-2.5">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-[#25483F]/15 bg-white px-3 py-1.5 text-sm font-bold text-[#142823] focus:border-[#173F35] cursor-pointer shadow-xs"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>
                trên tổng số <strong className="text-[#142823] font-bold">{totalItems}</strong> hướng dẫn viên
                {selectedGuideIds.size > 0 && (
                  <span className="ml-2 font-bold text-[#173F35]">
                    (Đã chọn {selectedGuideIds.size})
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#25483F]/15 bg-white text-[#142823] disabled:opacity-30 hover:bg-[#FAF7F0] shadow-xs cursor-pointer"
              >
                <VsIcon name="chevron_left" className="text-base" />
              </button>

              <span className="px-3 font-bold text-[#142823]">
                {safeCurrentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#25483F]/15 bg-white text-[#142823] disabled:opacity-30 hover:bg-[#FAF7F0] shadow-xs cursor-pointer"
              >
                <VsIcon name="chevron_right" className="text-base" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guide Create/Edit Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl border border-[#25483F]/12">
            <div className="flex items-center justify-between border-b border-[#25483F]/12 pb-4">
              <h3 className="text-2xl font-black text-[#142823] tracking-tight">
                {isEditing ? "Chỉnh sửa hồ sơ LocalMate" : "Thêm mới Hướng dẫn viên LocalMate"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl p-2 text-[#52635A] hover:bg-[#FAF7F0] hover:text-[#142823] transition-colors cursor-pointer"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSaveGuide} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                    Mã HDV
                  </label>
                  <input
                    type="text"
                    value={formData.guideCode}
                    onChange={(e) => setFormData({ ...formData, guideCode: e.target.value })}
                    disabled={isEditing}
                    placeholder="LM-001"
                    className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3.5 text-sm font-mono font-bold text-[#142823] disabled:bg-slate-100 disabled:text-[#788880]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                    Vị trí
                  </label>
                  <select
                    value={formData.position}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        position: e.target.value,
                      })
                    }
                    className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3.5 text-sm font-bold text-[#142823] cursor-pointer focus:bg-white focus:border-[#173F35]"
                  >
                    <option value="GUIDE">HDV Bản địa</option>
                    <option value="COORDINATOR">Điều phối vùng</option>
                    <option value="LEADER">Trưởng nhóm</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                    Trạng thái
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as LocalMateStatus,
                      })
                    }
                    className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3.5 text-sm font-bold text-[#142823] cursor-pointer focus:bg-white focus:border-[#173F35]"
                  >
                    <option value="QUALIFIED">QUALIFIED (Đã duyệt)</option>
                    <option value="PENDING">PENDING (Chờ duyệt)</option>
                    <option value="SUSPENDED">SUSPENDED (Tạm dừng)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Họ và tên *
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Ví dụ: Giàng A Pháo"
                  className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-sm font-bold text-[#142823] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                    Số điện thoại *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0912345678"
                    className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-sm font-semibold text-[#142823] focus:bg-white focus:border-[#173F35]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                    Email (Cấp tài khoản đăng nhập)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="guide@vietsage.vn"
                    className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-sm font-semibold text-[#142823] focus:bg-white focus:border-[#173F35]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Đường dẫn ảnh đại diện (Avatar URL) *
                </label>
                <input
                  type="url"
                  required
                  value={formData.avatarUrl}
                  onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-xs font-mono text-[#142823] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Mức phí dịch vụ / ngày (VND)
                </label>
                <input
                  type="number"
                  step={50000}
                  min={0}
                  value={formData.dailyRateVnd}
                  onChange={(e) =>
                    setFormData({ ...formData, dailyRateVnd: Number(e.target.value) })
                  }
                  className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-base font-black text-[#173F35] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Ngôn ngữ thành thạo (cách nhau bởi dấu phẩy) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.languages}
                  onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                  placeholder="English, Vietnamese, H'Mông"
                  className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-sm font-medium text-[#142823] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Khu vực hoạt động (cách nhau bởi dấu phẩy) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.operatingRegions}
                  onChange={(e) =>
                    setFormData({ ...formData, operatingRegions: e.target.value })
                  }
                  placeholder="Mù Cang Chải, Trạm Tấu, Yên Bái"
                  className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-sm font-medium text-[#142823] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <fieldset className="rounded-2xl border border-[#25483F]/12 bg-[#FBF9F5] p-4">
                <legend className="px-1 text-sm font-bold text-[#173F35]">
                  Mốc vị trí phục vụ LocalMate
                </legend>
                <p className="mb-3 text-sm text-[#52635A]">
                  Dùng để tính khoảng cách tới khách sạn. Đây là điểm phục vụ đại diện, không phải địa chỉ nhà riêng.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="localmate-service-latitude" className="mb-1.5 block text-sm font-semibold text-[#485951]">
                      Vĩ độ
                    </label>
                    <input
                      id="localmate-service-latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={formData.serviceLatitude}
                      onChange={(e) => setFormData({ ...formData, serviceLatitude: e.target.value })}
                      placeholder="21.033333"
                      className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-white px-4 text-base font-medium text-[#142823] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                    />
                  </div>
                  <div>
                    <label htmlFor="localmate-service-longitude" className="mb-1.5 block text-sm font-semibold text-[#485951]">
                      Kinh độ
                    </label>
                    <input
                      id="localmate-service-longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={formData.serviceLongitude}
                      onChange={(e) => setFormData({ ...formData, serviceLongitude: e.target.value })}
                      placeholder="104.883333"
                      className="h-12 w-full rounded-xl border border-[#25483F]/15 bg-white px-4 text-base font-medium text-[#142823] focus:border-[#173F35] focus:outline-none focus:ring-2 focus:ring-[#173F35]/15"
                    />
                  </div>
                </div>
              </fieldset>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Thế mạnh &amp; Chuyên môn (cách nhau bởi dấu phẩy)
                </label>
                <input
                  type="text"
                  value={formData.specialties}
                  onChange={(e) => setFormData({ ...formData, specialties: e.target.value })}
                  placeholder="Trekking, Chè Shan Tuyết, Ẩm thực dân tộc"
                  className="h-11 w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-4 text-sm font-medium text-[#142823] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#485951] mb-1.5">
                  Tiểu sử &amp; Giới thiệu ngắn
                </label>
                <textarea
                  rows={3}
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Kinh nghiệm 8 năm dẫn tour trải nghiệm cho khách quốc tế..."
                  className="w-full rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] p-3.5 text-sm font-medium text-[#142823] focus:bg-white focus:border-[#173F35]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#25483F]/12 pt-5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-11 rounded-xl border border-[#25483F]/15 px-5 text-sm font-bold text-[#52635A] hover:bg-[#FAF7F0] cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 rounded-xl bg-[#173F35] px-6 text-sm font-bold text-white shadow-md hover:bg-[#12322a] disabled:opacity-50 cursor-pointer transition-all"
                >
                  {isSaving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo LocalMate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Telegram Pairing Modal */}
      {pairingModalOpen && pairingGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[#25483F]/15 bg-white shadow-2xl transition-all">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#25483F]/10 bg-gradient-to-r from-[#173F35] to-[#245347] px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-white shadow-xs">
                  <VsIcon name="send" className="text-xl" />
                </span>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Kết nối Telegram cho LocalMate
                  </h3>
                  <p className="text-xs text-white/80">
                    Ghép nối bot để nhận đơn và chat 2 chiều với khách
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPairingModalOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <VsIcon name="close" className="text-xl" />
              </button>
            </div>

            {/* Guide Profile Preview */}
            <div className="flex items-center gap-3.5 bg-[#FAF7F0] px-6 py-4 border-b border-[#25483F]/10">
              <img
                src={pairingGuide.avatarUrl}
                alt={pairingGuide.fullName}
                className="h-12 w-12 rounded-2xl object-cover ring-2 ring-[#25483F]/15 shadow-xs"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-[#142823]">{pairingGuide.fullName}</span>
                  <span className="font-mono text-xs font-bold text-[#485951] bg-white border border-[#25483F]/15 px-2 py-0.5 rounded-md">
                    {pairingGuide.guideCode}
                  </span>
                </div>
                <div className="text-xs text-[#52635A] mt-0.5">
                  Tài khoản:{" "}
                  <span className="font-mono font-medium text-[#142823]">
                    {pairingGuide.user?.email || pairingGuide.email || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5">
              {isPairingLoading ? (
                <div className="py-12 text-center text-[#52635A] space-y-3">
                  <VsIcon name="sync" className="mx-auto text-4xl text-[#173F35] animate-spin" />
                  <p className="text-sm font-semibold">Đang khởi tạo liên kết kết nối Telegram...</p>
                </div>
              ) : pairingData ? (
                <>
                  {/* QR Code & Direct Open */}
                  <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4">
                    <div className="shrink-0 bg-white p-2.5 rounded-2xl border border-sky-100 shadow-xs">
                      <QRCodeSVG
                        value={pairingData.pairingUrl}
                        size={128}
                        aria-label="QR ghép nối Telegram có hiệu lực mười phút"
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-center sm:text-left space-y-2">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-ping" />
                        Liên kết một lần (10 phút)
                      </div>
                      <h4 className="font-bold text-sm text-neutral-900">
                        Quét mã QR hoặc mở ứng dụng Telegram
                      </h4>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Dùng camera điện thoại để quét mã QR mở bot trên Telegram hoặc click nút bên dưới.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(pairingData.pairingUrl, "_blank", "noopener,noreferrer")
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-sky-600 hover:to-sky-700 transition-all cursor-pointer"
                      >
                        <VsIcon name="send" className="text-sm" />
                        <span>Mở Telegram ngay</span>
                      </button>
                    </div>
                  </div>

                  {/* Copy Link Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#485951]">
                      Đường dẫn ghép nối Telegram
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={pairingData.pairingUrl}
                        className="h-10 flex-1 rounded-xl border border-[#25483F]/15 bg-[#FBF9F5] px-3 font-mono text-xs text-[#142823] focus:outline-none select-all"
                      />
                      <button
                        type="button"
                        onClick={handleCopyPairingLink}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#25483F]/15 bg-white px-3.5 text-xs font-bold text-[#142823] hover:bg-[#FAF7F0] transition-colors cursor-pointer shrink-0"
                      >
                        <VsIcon
                          name={copiedLink ? "check" : "content_copy"}
                          className="text-sm"
                        />
                        <span>{copiedLink ? "Đã chép!" : "Sao chép"}</span>
                      </button>
                    </div>
                  </div>

                  {/* 3 Step Instructions */}
                  <div className="rounded-2xl border border-[#25483F]/10 bg-[#FAF7F0]/60 p-4 space-y-2 text-xs text-[#52635A]">
                    <div className="font-bold text-[#142823] uppercase tracking-wider text-[11px]">
                      Các bước hoàn tất kết nối:
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-black text-[#173F35]">1.</span>
                      <span>
                        Bấm nút <b>Mở Telegram ngay</b> hoặc gửi link trên cho hướng dẫn viên.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-black text-[#173F35]">2.</span>
                      <span>
                        Trong cửa sổ chat với VietSage Bot trên Telegram, bấm nút <b>START</b> (hoặc gửi <code>/start</code>).
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-black text-[#173F35]">3.</span>
                      <span>
                        Bot sẽ xác nhận kết nối thành công. Sau đó quay lại đây bấm nút <b>Kiểm tra trạng thái</b> bên dưới!
                      </span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[#25483F]/10 bg-[#FAF7F0] px-6 py-4">
              <button
                type="button"
                onClick={() => setPairingModalOpen(false)}
                className="h-10 rounded-xl border border-[#25483F]/15 bg-white px-4 text-xs font-bold text-[#52635A] hover:bg-[#FAF7F0] cursor-pointer transition-colors"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleRefreshTelegramStatus}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#173F35] px-5 text-xs font-bold text-white shadow-xs hover:bg-[#12322a] cursor-pointer transition-all"
              >
                <VsIcon name="refresh" className="text-sm" />
                <span>Kiểm tra trạng thái</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
