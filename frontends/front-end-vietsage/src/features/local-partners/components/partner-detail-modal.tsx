"use client";

import React, { useState } from "react";
import type { LocalPartner, LocalPartnerOffer } from "../types/local-partners-contract";
import { localPartnersClient } from "../service/local-partners.client";

interface PartnerDetailModalProps {
  partner: LocalPartner | null;
  hotelId: string;
  stayId?: string;
  onClose: () => void;
}

export function PartnerDetailModal({ partner, hotelId, stayId, onClose }: PartnerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"info" | "offers" | "book">("info");
  const [claimedOffer, setClaimedOffer] = useState<{ offer: LocalPartnerOffer; code: string } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  if (!partner) return null;

  const handleRecordClick = (actionType: string, url?: string) => {
    void localPartnersClient.recordInteraction(hotelId, partner.id, actionType, stayId);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleClaimOffer = async (offer: LocalPartnerOffer) => {
    try {
      await localPartnersClient.claimOffer(hotelId, partner.id, offer.id, stayId);
      setClaimedOffer({ offer, code: offer.discountCode || "VIETSAGE10" });
    } catch {
      setClaimedOffer({ offer, code: offer.discountCode || "VIETSAGE10" });
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !roomNumber || !guestPhone || !serviceType) return;

    setIsSubmitting(true);
    try {
      await localPartnersClient.createBookingRequest(
        hotelId,
        {
          partnerId: partner.id,
          guestName,
          roomNumber,
          guestPhone,
          serviceType,
          notes,
        },
        stayId,
      );
      setBookingSuccess(true);
    } catch (err) {
      alert("Không thể gửi yêu cầu. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cover / Header */}
        <div className="relative h-44 bg-slate-800 flex-shrink-0">
          {partner.coverImageUrl ? (
            <img src={partner.coverImageUrl} alt={partner.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-emerald-900 via-slate-800 to-slate-900 flex items-center justify-center">
              <span className="material-icons text-5xl text-emerald-400 opacity-60">storefront</span>
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/50 hover:bg-black text-white flex items-center justify-center transition-colors"
          >
            <span className="material-icons text-lg">close</span>
          </button>
          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <span className="material-icons text-xs">place</span>
            <span>{partner.distanceMeters ? `Cách ${partner.distanceMeters}m` : "Gần khách sạn"}</span>
          </div>
        </div>

        {/* Title */}
        <div className="p-4 pb-2 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-xl font-bold text-white leading-tight">{partner.name}</h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <span className="material-icons text-xs text-slate-500">location_on</span>
            {partner.address}
          </p>
        </div>

        {/* Nav Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 flex-shrink-0 text-xs font-bold text-slate-400">
          <button
            onClick={() => setActiveTab("info")}
            className={`flex-1 py-2.5 text-center transition-colors ${
              activeTab === "info" ? "text-emerald-400 border-b-2 border-emerald-400 bg-slate-900/40" : "hover:text-white"
            }`}
          >
            Giới thiệu
          </button>
          <button
            onClick={() => setActiveTab("offers")}
            className={`flex-1 py-2.5 text-center transition-colors relative ${
              activeTab === "offers" ? "text-emerald-400 border-b-2 border-emerald-400 bg-slate-900/40" : "hover:text-white"
            }`}
          >
            Ưu đãi khách VietSage
            {partner.offers && partner.offers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                {partner.offers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("book")}
            className={`flex-1 py-2.5 text-center transition-colors ${
              activeTab === "book" ? "text-emerald-400 border-b-2 border-emerald-400 bg-slate-900/40" : "hover:text-white"
            }`}
          >
            Nhờ Lễ tân đặt
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-sm text-slate-300">
          {activeTab === "info" && (
            <div className="space-y-4">
              {partner.description && (
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 text-xs leading-relaxed text-slate-300">
                  {partner.description}
                </div>
              )}

              {partner.operatingHours && (
                <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/20 p-2.5 rounded-lg border border-amber-500/20">
                  <span className="material-icons text-sm text-amber-400">schedule</span>
                  <span>Giờ mở cửa: {partner.operatingHours}</span>
                </div>
              )}

              {/* Quick Action Grid */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {partner.phone && (
                  <button
                    onClick={() => handleRecordClick("CLICK_CALL", `tel:${partner.phone}`)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-colors"
                  >
                    <span className="material-icons text-xl mb-1">call</span>
                    <span className="text-[11px] font-bold text-slate-200">Gọi điện</span>
                  </button>
                )}

                {partner.zaloUrl && (
                  <button
                    onClick={() => handleRecordClick("CLICK_ZALO", partner.zaloUrl!)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 transition-colors"
                  >
                    <span className="material-icons text-xl mb-1">chat</span>
                    <span className="text-[11px] font-bold text-slate-200">Chat Zalo</span>
                  </button>
                )}

                {partner.googleMapUrl ? (
                  <button
                    onClick={() => handleRecordClick("CLICK_MAP", partner.googleMapUrl!)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-colors"
                  >
                    <span className="material-icons text-xl mb-1">map</span>
                    <span className="text-[11px] font-bold text-slate-200">Bản đồ</span>
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleRecordClick(
                        "CLICK_MAP",
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          partner.name + " " + partner.address,
                        )}`,
                      )
                    }
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-colors"
                  >
                    <span className="material-icons text-xl mb-1">directions</span>
                    <span className="text-[11px] font-bold text-slate-200">Chỉ đường</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === "offers" && (
            <div className="space-y-3">
              {claimedOffer && (
                <div className="p-4 rounded-xl bg-emerald-950/60 border-2 border-emerald-500 text-center space-y-2">
                  <span className="material-icons text-3xl text-emerald-400">verified</span>
                  <h4 className="font-bold text-emerald-200 text-base">Đã nhận mã ưu đãi thành công!</h4>
                  <p className="text-xs text-slate-300">{claimedOffer.offer.title}</p>
                  <div className="inline-block bg-slate-900 border border-emerald-400/50 px-4 py-2 rounded-lg text-lg font-mono font-black text-amber-300 tracking-wider">
                    {claimedOffer.code}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Xuất trình mã này hoặc đọc số phòng VietSage của bạn tại điểm dịch vụ để áp dụng ưu đãi.
                  </p>
                </div>
              )}

              {partner.offers && partner.offers.length > 0 ? (
                partner.offers.map((offer) => (
                  <div key={offer.id} className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-amber-300 text-sm">{offer.title}</h4>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          Dành riêng cho khách
                        </span>
                      </div>
                      {offer.description && <p className="text-xs text-slate-300 mt-1">{offer.description}</p>}
                      {offer.termsCondition && <p className="text-[11px] text-slate-400 mt-1 italic">{offer.termsCondition}</p>}
                    </div>

                    <button
                      onClick={() => handleClaimOffer(offer)}
                      className="mt-1 w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-1"
                    >
                      <span className="material-icons text-sm">confirmation_number</span>
                      <span>Nhận mã ưu đãi</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Hiện chưa có chương trình ưu đãi riêng. Bạn vẫn có thể liên hệ trực tiếp điểm dịch vụ!
                </div>
              )}
            </div>
          )}

          {activeTab === "book" && (
            <div>
              {bookingSuccess ? (
                <div className="p-6 text-center space-y-3 bg-slate-800/50 rounded-xl border border-emerald-500/30">
                  <span className="material-icons text-4xl text-emerald-400">check_circle</span>
                  <h4 className="font-bold text-white text-base">Đã gửi yêu cầu tới Lễ tân!</h4>
                  <p className="text-xs text-slate-300">
                    Lễ tân khách sạn sẽ xác nhận và hỗ trợ liên hệ đặt chỗ cho bạn trong ít phút.
                  </p>
                  <button
                    onClick={() => setBookingSuccess(false)}
                    className="mt-2 text-xs text-emerald-400 hover:underline font-semibold"
                  >
                    Gửi yêu cầu khác
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitBooking} className="space-y-3 text-xs">
                  <p className="text-slate-400 text-[11px]">
                    Lễ tân VietSage sẽ hỗ trợ gọi điện / đặt bàn / đặt chỗ đối tác giúp bạn nhanh chóng và chuẩn xác.
                  </p>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Họ và tên của bạn *</label>
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Số phòng *</label>
                      <input
                        type="text"
                        required
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                        placeholder="Ví dụ: 302"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Số điện thoại *</label>
                      <input
                        type="tel"
                        required
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="0912..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Loại dịch vụ cần hỗ trợ *</label>
                    <input
                      type="text"
                      required
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value)}
                      placeholder="Ví dụ: Đặt bàn 4 người lúc 19h / Thuê xe máy 2 ngày"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Ghi chú thêm</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Yêu cầu đặc biệt nếu có..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-1 text-sm mt-2"
                  >
                    <span className="material-icons text-base">send</span>
                    <span>{isSubmitting ? "Đang gửi..." : "Gửi yêu cầu nhờ Lễ tân hỗ trợ"}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
