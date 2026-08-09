"use client";

import React, { useState } from "react";
import type { LocalPartner, LocalPartnerCategory, LocalPartnerInput } from "../types/local-partners-contract";

interface PartnerFormModalProps {
  partner?: LocalPartner | null;
  categories: LocalPartnerCategory[];
  onSave: (payload: LocalPartnerInput) => Promise<void>;
  onClose: () => void;
}

export function PartnerFormModal({ partner, categories, onSave, onClose }: PartnerFormModalProps) {
  const [categoryId, setCategoryId] = useState(partner?.categoryId || categories[0]?.id || "");
  const [name, setName] = useState(partner?.name || "");
  const [description, setDescription] = useState(partner?.description || "");
  const [address, setAddress] = useState(partner?.address || "");
  const [distanceMeters, setDistanceMeters] = useState<number | "">(partner?.distanceMeters || "");
  const [phone, setPhone] = useState(partner?.phone || "");
  const [zaloUrl, setZaloUrl] = useState(partner?.zaloUrl || "");
  const [googleMapUrl, setGoogleMapUrl] = useState(partner?.googleMapUrl || "");
  const [coverImageUrl, setCoverImageUrl] = useState(partner?.coverImageUrl || "");
  const [operatingHours, setOperatingHours] = useState(partner?.operatingHours || "");
  const [isFeatured, setIsFeatured] = useState(partner?.isFeatured || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !address || !categoryId) return;

    setError(undefined);
    setIsSubmitting(true);
    try {
      await onSave({
        categoryId,
        name,
        description: description || undefined,
        address,
        distanceMeters: distanceMeters === "" ? undefined : Number(distanceMeters),
        phone: phone || undefined,
        zaloUrl: zaloUrl || undefined,
        googleMapUrl: googleMapUrl || undefined,
        coverImageUrl: coverImageUrl || undefined,
        operatingHours: operatingHours || undefined,
        isFeatured,
      });
      onClose();
    } catch {
      setError("Không thể lưu đối tác. Kiểm tra thông tin rồi thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <h3 className="font-bold text-lg text-white">
            {partner ? "Chỉnh sửa đối tác lân cận" : "Thêm mới đối tác lân cận"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
          {error ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">{error}</p> : null}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Danh mục đối tác *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameVi} ({cat.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Tên đối tác / Điểm dịch vụ *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Nhà hàng Phở Gìn / Spa Thảo Mộc"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Địa chỉ *</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ví dụ: 123 Phố Huế, Hai Bà Trưng, Hà Nội"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Khoảng cách (m)</label>
              <input
                type="number"
                value={distanceMeters}
                onChange={(e) => setDistanceMeters(e.target.value ? Number(e.target.value) : "")}
                placeholder="Ví dụ: 300"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Số điện thoại liên hệ</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912345678"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Giờ mở cửa</label>
              <input
                type="text"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                placeholder="08:00 - 22:30"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Link Zalo / Fanpage</label>
            <input
              type="url"
              value={zaloUrl}
              onChange={(e) => setZaloUrl(e.target.value)}
              placeholder="https://zalo.me/..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Link Google Maps</label>
            <input
              type="url"
              value={googleMapUrl}
              onChange={(e) => setGoogleMapUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">URL Ảnh bìa / Cover Image</label>
            <input
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Mô tả ngắn</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Giới thiệu món ăn đặc sắc, dịch vụ cao cấp..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isFeatured"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="h-4 w-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <label htmlFor="isFeatured" className="text-slate-300 font-semibold cursor-pointer">
              Đánh dấu NỔI BẬT (Ưu tiên hiển thị đầu tiên cho khách)
            </label>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg"
            >
              {isSubmitting ? "Đang lưu..." : "Lưu thông tin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
