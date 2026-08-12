"use client";
import { type FormEvent, useState } from "react";
import { LocationFields, type LocationValue } from "@/features/marketplace/components/location-fields";
import { useServicePortal } from "./use-service-portal";
import type { MarketplaceOrder, ServicePortalData } from "./types";

function locationFrom(data: ServicePortalData): LocationValue {
  const item = data.profile;
  return { googleMapsUrl: item.googleMapsUrl ?? "", latitude: item.latitude == null ? "" : String(item.latitude), longitude: item.longitude == null ? "" : String(item.longitude), locationAccuracyMeters: item.locationAccuracyMeters == null ? "" : String(item.locationAccuracyMeters), locationSource: item.locationSource ?? undefined };
}
function nextStatus(order: MarketplaceOrder): string | null {
  if (order.status === "PENDING") return "CONFIRMED";
  if (
    order.status === "CONFIRMED" ||
    order.status === "ACCEPTED" ||
    order.status === "PREPARING" ||
    order.status === "DELIVERING" ||
    order.status === "READY"
  ) {
    return "COMPLETED";
  }
  return null;
}
const inputClass = "min-h-11 w-full rounded-xl border px-3";
function Loaded({ value }: { value: ServicePortalData }) {
  const { profile, create, transition } = useServicePortal();
  const [location, setLocation] = useState(() => locationFrom(value));
  const saveLocation = () => profile.mutate({ googleMapsUrl: location.googleMapsUrl || null, latitude: location.latitude ? Number(location.latitude) : null, longitude: location.longitude ? Number(location.longitude) : null, locationAccuracyMeters: location.locationAccuracyMeters ? Number(location.locationAccuracyMeters) : null, locationSource: location.locationSource ?? null });
  const createService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    create.mutate({ name: String(form.get("name")), unitPrice: Number(form.get("unitPrice")), imageUrls: [], mode: String(form.get("mode")), capacityAvailable: form.get("capacity") ? Number(form.get("capacity")) : null, waitingMinutes: Number(form.get("waitingMinutes")), status: "ACTIVE" });
  };
  return <main className="mx-auto max-w-6xl space-y-8 p-6"><header><p className="font-semibold text-emerald-700">ĐỐI TÁC DỊCH VỤ BÊN NGOÀI</p><h1 className="text-3xl font-bold">{value.profile.displayName}</h1></header>
    <section className="rounded-2xl bg-white p-5 shadow"><LocationFields value={location} onChange={setLocation}/><button onClick={saveLocation} disabled={profile.isPending} className="mt-4 min-h-11 rounded-xl bg-emerald-700 px-5 font-semibold text-white">Lưu vị trí</button></section>
    <section className="grid gap-5 lg:grid-cols-[360px_1fr]"><form onSubmit={createService} className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Thêm dịch vụ</h2><p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Danh mục: {value.profile.category?.nameVi ?? "Chưa được gán"}</p><input required name="name" placeholder="Tên dịch vụ" className={inputClass}/><input required min={0} type="number" name="unitPrice" placeholder="Giá VND" className={inputClass}/><input min={0} type="number" name="capacity" placeholder="Capacity; trống = không giới hạn" className={inputClass}/><input required min={0} type="number" name="waitingMinutes" placeholder="Thời gian chờ (phút)" className={inputClass}/><select name="mode" className={inputClass}><option value="CUSTOMER_AT_SERVICE">Phục vụ tại địa điểm</option><option value="DELIVERY_TO_HOTEL">Giao tận nơi</option></select><button disabled={create.isPending} className="min-h-11 rounded-xl bg-emerald-700 px-5 font-semibold text-white">Tạo dịch vụ</button></form><div><h2 className="text-xl font-bold">Dịch vụ</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{value.services.map((item) => <article key={item.id} className="rounded-xl border bg-white p-4"><h3 className="font-bold">{item.name}</h3><p>{Number(item.unitPrice).toLocaleString("vi-VN")} VND · Chờ {item.waitingMinutes} phút</p><p className="text-sm">Capacity: {item.capacityAvailable ?? "Không giới hạn"} · {item.status}</p></article>)}</div></div></section>
    <section><h2 className="text-xl font-bold">Đơn hàng</h2><div className="mt-3 space-y-3">{value.orders.map((order) => { const next = nextStatus(order); return <article key={order.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><b>{order.orderNumber}</b><p>{order.serviceNameSnapshot} · {order.status}</p></div>{next ? <button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-white" onClick={() => transition.mutate({ orderId: order.id, toStatus: next })}>{next}</button> : null}</div></article>; })}</div></section>
    {profile.isError || create.isError || transition.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">Không thể lưu thay đổi.</p> : null}</main>;
}
export function ServicePortalClient() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8">Đang tải…</div>;
  if (data.isError || !data.data) return <div role="alert" className="p-8">Không thể tải Service Portal.</div>;
  return <Loaded key={data.data.profile.locationVerifiedAt ?? "unverified"} value={data.data}/>;
}
