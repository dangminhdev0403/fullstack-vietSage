"use client";

import React, { useEffect, useState } from "react";
import type { LocalPartner, LocalPartnerCategory } from "../types/local-partners-contract";
import { localPartnersClient } from "../service/local-partners.client";
import { PartnerDetailModal } from "./partner-detail-modal";

interface GuestLocalPartnersProps {
  hotelId: string;
  stayId?: string;
}

export function GuestLocalPartners({ hotelId, stayId }: GuestLocalPartnersProps) {
  const [categories, setCategories] = useState<LocalPartnerCategory[]>([]);
  const [partners, setPartners] = useState<LocalPartner[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [selectedDistance, setSelectedDistance] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<LocalPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await localPartnersClient.getGuestCategories();
        setCategories(cats);
      } catch (err) {
        console.error("Failed to load partner categories", err);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const fetchPartners = async () => {
      setIsLoading(true);
      try {
        const list = await localPartnersClient.getGuestPartners(hotelId, {
          categoryId: selectedCategoryId,
          maxDistanceMeters: selectedDistance,
          q: searchQuery || undefined,
        });
        setPartners(list);
      } catch (err) {
        console.error("Failed to fetch nearby partners", err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchPartners, 300);
    return () => clearTimeout(timer);
  }, [hotelId, selectedCategoryId, selectedDistance, searchQuery]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Header & Search */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="material-icons text-emerald-400">explore</span>
              Khám phá quanh khách sạn
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Địa điểm ăn uống, vui chơi, spa & dịch vụ đối tác lân cận với ưu đãi dành riêng cho bạn
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <span className="material-icons absolute left-3 top-2.5 text-slate-500 text-sm">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên địa điểm, món ăn, spa, thuê xe..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Distance Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex-shrink-0">Bán kính:</span>
          {[
            { label: "Tất cả", value: undefined },
            { label: "< 500m", value: 500 },
            { label: "< 1km", value: 1000 },
            { label: "< 3km", value: 3000 },
          ].map((dist) => (
            <button
              key={dist.label}
              onClick={() => setSelectedDistance(dist.value)}
              className={`px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedDistance === dist.value
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-sm"
                  : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500"
              }`}
            >
              {dist.label}
            </button>
          ))}
        </div>

        {/* Categories Horizontal Scroll */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 text-xs no-scrollbar">
            <button
              onClick={() => setSelectedCategoryId(undefined)}
              className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                selectedCategoryId === undefined
                  ? "bg-slate-800 text-emerald-400 border-emerald-500 font-bold"
                  : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <span className="material-icons text-sm">grid_view</span>
              <span>Tất cả danh mục</span>
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  selectedCategoryId === cat.id
                    ? "bg-slate-800 text-emerald-400 border-emerald-500 font-bold"
                    : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                <span className="material-icons text-sm">{cat.icon || "storefront"}</span>
                <span>{cat.nameVi}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Partner Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-56 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : partners.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {partners.map((partner) => (
            <div
              key={partner.id}
              onClick={() => setSelectedPartner(partner)}
              className="group bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden shadow-lg hover:shadow-emerald-950/40 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              {/* Card Image Header */}
              <div className="relative h-36 bg-slate-800 overflow-hidden">
                {partner.coverImageUrl ? (
                  <img
                    src={partner.coverImageUrl}
                    alt={partner.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950 flex items-center justify-center">
                    <span className="material-icons text-4xl text-emerald-500/40">storefront</span>
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  {partner.isFeatured && (
                    <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-0.5">
                      <span className="material-icons text-[12px]">star</span> Nổi bật
                    </span>
                  )}
                  {partner.category && (
                    <span className="bg-slate-900/80 backdrop-blur-md text-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-700">
                      {partner.category.nameVi}
                    </span>
                  )}
                </div>

                {/* Distance Badge */}
                <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="material-icons text-[12px]">place</span>
                  <span>{partner.distanceMeters ? `Cách ${partner.distanceMeters}m` : "Gần khách sạn"}</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                <div>
                  <h3 className="font-bold text-white text-base leading-snug group-hover:text-emerald-400 transition-colors">
                    {partner.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{partner.address}</p>
                </div>

                {/* Offer tag if present */}
                {partner.offers && partner.offers.length > 0 && (
                  <div className="mt-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2">
                    <span className="material-icons text-amber-400 text-base">card_giftcard</span>
                    <span className="text-xs font-bold text-amber-300 truncate">
                      {partner.offers[0].title}
                    </span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between text-xs text-emerald-400 font-semibold border-t border-slate-800/80">
                  <span>Xem chi tiết & Ưu đãi</span>
                  <span className="material-icons text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
          <span className="material-icons text-4xl text-slate-600">location_off</span>
          <h3 className="text-base font-bold text-slate-200">Không tìm thấy đối tác lân cận phù hợp</h3>
          <p className="text-xs text-slate-400">Thử đổi từ khóa tìm kiếm hoặc mở rộng bán kính tìm kiếm.</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedPartner && (
        <PartnerDetailModal
          partner={selectedPartner}
          hotelId={hotelId}
          stayId={stayId}
          onClose={() => setSelectedPartner(null)}
        />
      )}
    </div>
  );
}
