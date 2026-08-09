"use client";

import React, { useEffect, useState } from "react";
import type {
  LocalPartner,
  LocalPartnerCategory,
  LocalPartnerBookingRequest,
  LocalPartnerAnalytics,
} from "../types/local-partners-contract";
import { localPartnersClient } from "../service/local-partners.client";
import { PartnerFormModal } from "./partner-form-modal";

interface StaffLocalPartnersClientProps {
  hotelId: string;
  accessToken: string;
}

export function StaffLocalPartnersClient({ hotelId, accessToken }: StaffLocalPartnersClientProps) {
  const [activeTab, setActiveTab] = useState<"partners" | "requests" | "offers">("partners");
  const [categories, setCategories] = useState<LocalPartnerCategory[]>([]);
  const [partners, setPartners] = useState<LocalPartner[]>([]);
  const [bookingRequests, setBookingRequests] = useState<LocalPartnerBookingRequest[]>([]);
  const [analytics, setAnalytics] = useState<LocalPartnerAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<LocalPartner | null>(null);
  const [offerPartner, setOfferPartner] = useState<LocalPartner | null>(null);

  // Offer form inputs
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cats, partList, reqList, stats] = await Promise.all([
        localPartnersClient.getGuestCategories(),
        localPartnersClient.getStaffPartners(hotelId, accessToken),
        localPartnersClient.getStaffBookingRequests(hotelId, accessToken),
        localPartnersClient.getStaffAnalytics(hotelId, accessToken),
      ]);
      setCategories(cats);
      setPartners(partList);
      setBookingRequests(reqList);
      setAnalytics(stats);
    } catch (err) {
      console.error("Failed to load staff partners data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [hotelId, accessToken]);

  const handleSavePartner = async (payload: any) => {
    if (editingPartner) {
      await localPartnersClient.updatePartner(hotelId, editingPartner.id, accessToken, payload);
    } else {
      await localPartnersClient.createPartner(hotelId, accessToken, payload);
    }
    await loadData();
  };

  const handleToggleStatus = async (partner: LocalPartner) => {
    const nextStatus = partner.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      await localPartnersClient.updatePartner(hotelId, partner.id, accessToken, { status: nextStatus });
      await loadData();
    } catch (err) {
      alert("Lỗi khi thay đổi trạng thái");
    }
  };

  const handleDeletePartner = async (partnerId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa đối tác này?")) return;
    try {
      await localPartnersClient.deletePartner(hotelId, partnerId, accessToken);
      await loadData();
    } catch (err) {
      alert("Lỗi khi xóa đối tác");
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerPartner || !offerTitle) return;

    setIsSubmittingOffer(true);
    try {
      await localPartnersClient.createOffer(hotelId, offerPartner.id, accessToken, {
        title: offerTitle,
        description: offerDescription || undefined,
        discountCode: offerCode || undefined,
      });
      setOfferPartner(null);
      setOfferTitle("");
      setOfferDescription("");
      setOfferCode("");
      await loadData();
    } catch (err) {
      alert("Lỗi khi tạo chương trình ưu đãi");
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const handleUpdateBookingStatus = async (requestId: string, status: string) => {
    try {
      await localPartnersClient.updateBookingRequestStatus(hotelId, requestId, accessToken, status);
      await loadData();
    } catch (err) {
      alert("Lỗi khi cập nhật trạng thái yêu cầu");
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span className="material-icons text-emerald-400 text-3xl">handshake</span>
            Quản lý Đối tác & Dịch vụ Lân cận
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Nhúng và kết nối các điểm dịch vụ địa phương quanh khách sạn, quản lý chương trình ưu đãi cho khách ở
          </p>
        </div>

        <button
          onClick={() => {
            setEditingPartner(null);
            setShowPartnerModal(true);
          }}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span className="material-icons text-base">add</span>
          <span>Thêm đối tác lân cận</span>
        </button>
      </div>

      {/* Analytics KPI Stat Cards */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
            <div className="text-xs text-slate-400 font-semibold">Tổng số đối tác</div>
            <div className="text-2xl font-black text-white mt-1">{analytics.totalPartners}</div>
            <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <span className="material-icons text-xs">storefront</span> Địa điểm lân cận
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
            <div className="text-xs text-slate-400 font-semibold">Ưu đãi đang chạy</div>
            <div className="text-2xl font-black text-amber-300 mt-1">{analytics.totalOffers}</div>
            <div className="text-[11px] text-amber-400/80 mt-1 flex items-center gap-1">
              <span className="material-icons text-xs">confirmation_number</span> Voucher VietSage
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
            <div className="text-xs text-slate-400 font-semibold">Yêu cầu đặt dịch vụ</div>
            <div className="text-2xl font-black text-sky-300 mt-1">{analytics.totalBookings}</div>
            <div className="text-[11px] text-sky-400/80 mt-1 flex items-center gap-1">
              <span className="material-icons text-xs">support_agent</span> Khách nhờ Lễ tân
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
            <div className="text-xs text-slate-400 font-semibold">Lượt xem chi tiết</div>
            <div className="text-2xl font-black text-purple-300 mt-1">
              {analytics.interactions.VIEW_DETAIL || 0}
            </div>
            <div className="text-[11px] text-purple-400/80 mt-1 flex items-center gap-1">
              <span className="material-icons text-xs">visibility</span> Tương tác khách ở
            </div>
          </div>
        </div>
      )}

      {/* Nav Tabs */}
      <div className="flex border-b border-slate-800 text-sm font-bold text-slate-400">
        <button
          onClick={() => setActiveTab("partners")}
          className={`px-5 py-3 transition-colors flex items-center gap-2 ${
            activeTab === "partners"
              ? "text-emerald-400 border-b-2 border-emerald-400 bg-slate-900/50"
              : "hover:text-white"
          }`}
        >
          <span className="material-icons text-lg">storefront</span>
          <span>Danh sách Đối tác ({partners.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`px-5 py-3 transition-colors flex items-center gap-2 relative ${
            activeTab === "requests"
              ? "text-emerald-400 border-b-2 border-emerald-400 bg-slate-900/50"
              : "hover:text-white"
          }`}
        >
          <span className="material-icons text-lg">support_agent</span>
          <span>Yêu cầu đặt dịch vụ ngoài ({bookingRequests.length})</span>
          {bookingRequests.filter((r) => r.status === "PENDING").length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-xs font-black">
              {bookingRequests.filter((r) => r.status === "PENDING").length} Mới
            </span>
          )}
        </button>
      </div>

      {/* Tab Contents */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 p-12 text-center text-slate-400 rounded-2xl animate-pulse">
          Đang tải dữ liệu đối tác lân cận...
        </div>
      ) : activeTab === "partners" ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                <tr>
                  <th className="p-4">Đối tác / Địa điểm</th>
                  <th className="p-4">Danh mục</th>
                  <th className="p-4">Khoảng cách</th>
                  <th className="p-4">Liên hệ</th>
                  <th className="p-4">Ưu đãi</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {partners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0">
                          {partner.coverImageUrl ? (
                            <img src={partner.coverImageUrl} alt={partner.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-emerald-400">
                              <span className="material-icons text-lg">storefront</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-1.5">
                            {partner.name}
                            {partner.isFeatured && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black border border-amber-500/40">
                                NỔI BẬT
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400 text-[11px] max-w-xs truncate">{partner.address}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-md bg-slate-800 text-slate-300 font-semibold">
                        {partner.category?.nameVi || "Khác"}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-emerald-400">
                      {partner.distanceMeters ? `${partner.distanceMeters}m` : "-"}
                    </td>
                    <td className="p-4">
                      {partner.phone ? (
                        <div className="font-mono text-slate-200">{partner.phone}</div>
                      ) : (
                        <span className="text-slate-500 italic">Chưa có</span>
                      )}
                    </td>
                    <td className="p-4">
                      {partner.offers && partner.offers.length > 0 ? (
                        <span className="px-2 py-1 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/30">
                          {partner.offers.length} Ưu đãi
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Chưa có</span>
                      )}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleStatus(partner)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                          partner.status === "ACTIVE"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900"
                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {partner.status === "ACTIVE" ? "ĐANG HIỂN THỊ" : "TẠM ẨN"}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setOfferPartner(partner)}
                          title="Tạo ưu đãi mới"
                          className="p-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        >
                          <span className="material-icons text-base">card_giftcard</span>
                        </button>
                        <button
                          onClick={() => {
                            setEditingPartner(partner);
                            setShowPartnerModal(true);
                          }}
                          title="Chỉnh sửa đối tác"
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                        >
                          <span className="material-icons text-base">edit</span>
                        </button>
                        <button
                          onClick={() => handleDeletePartner(partner.id)}
                          title="Xóa đối tác"
                          className="p-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-500/30"
                        >
                          <span className="material-icons text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Booking Requests Table */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                <tr>
                  <th className="p-4">Khách ở & Phòng</th>
                  <th className="p-4">Đối tác yêu cầu</th>
                  <th className="p-4">Loại dịch vụ nhờ đặt</th>
                  <th className="p-4">SĐT khách</th>
                  <th className="p-4">Thời gian tạo</th>
                  <th className="p-4">Trạng thái</th>
                  <th className="p-4 text-right">Xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {bookingRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-4 font-bold text-white">
                      <div>{req.guestName}</div>
                      <div className="text-emerald-400 text-[11px] font-mono">Phòng {req.roomNumber}</div>
                    </td>
                    <td className="p-4 font-semibold text-slate-200">{req.partner?.name || "-"}</td>
                    <td className="p-4 text-slate-300">
                      <div>{req.serviceType}</div>
                      {req.notes && <div className="text-[11px] text-slate-400 italic">"{req.notes}"</div>}
                    </td>
                    <td className="p-4 font-mono text-slate-300">{req.guestPhone}</td>
                    <td className="p-4 text-slate-400">
                      {new Date(req.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                          req.status === "PENDING"
                            ? "bg-amber-950 text-amber-300 border-amber-500/40"
                            : req.status === "CONFIRMED"
                            ? "bg-sky-950 text-sky-300 border-sky-500/40"
                            : req.status === "COMPLETED"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-500/40"
                            : "bg-rose-950 text-rose-300 border-rose-500/40"
                        }`}
                      >
                        {req.status === "PENDING"
                          ? "MỚI GỬI"
                          : req.status === "CONFIRMED"
                          ? "ĐÃ XÁC NHẬN"
                          : req.status === "COMPLETED"
                          ? "HOÀN THÀNH"
                          : "ĐÃ HỦY"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <select
                        value={req.status}
                        onChange={(e) => handleUpdateBookingStatus(req.id, e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-xs text-white rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="PENDING">Chờ xử lý</option>
                        <option value="CONFIRMED">Đã xác nhận</option>
                        <option value="COMPLETED">Hoàn thành</option>
                        <option value="CANCELLED">Hủy yêu cầu</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partner Create/Edit Form Modal */}
      {showPartnerModal && (
        <PartnerFormModal
          partner={editingPartner}
          categories={categories}
          onSave={handleSavePartner}
          onClose={() => setShowPartnerModal(false)}
        />
      )}

      {/* Create Offer Modal */}
      {offerPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 text-white rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">Thêm ưu đãi: {offerPartner.name}</h3>
              <button onClick={() => setOfferPartner(null)} className="text-slate-400 hover:text-white">
                <span className="material-icons text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tiêu đề ưu đãi *</label>
                <input
                  type="text"
                  required
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  placeholder="Ví dụ: Giảm 10% tổng hóa đơn ăn uống"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mã ưu đãi (Discount Code)</label>
                <input
                  type="text"
                  value={offerCode}
                  onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: VIETSAGE10"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Điều kiện áp dụng</label>
                <textarea
                  rows={2}
                  value={offerDescription}
                  onChange={(e) => setOfferDescription(e.target.value)}
                  placeholder="Ví dụ: Áp dụng cho hóa đơn từ 300.000đ khi đọc số phòng VietSage..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOfferPartner(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOffer}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black rounded-lg shadow-lg"
                >
                  {isSubmittingOffer ? "Đang tạo..." : "Tạo ưu đãi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
