"use client";
import { useState } from "react";
import { LocationFields, type LocationValue } from "@/features/marketplace/components/location-fields";
import { useServicePortal } from "./use-service-portal";
import type { ServicePortalData } from "./types";

function locationFrom(data: ServicePortalData): LocationValue {
  const item = data.profile;
  return { googleMapsUrl: item.googleMapsUrl ?? "", latitude: item.latitude == null ? "" : String(item.latitude), longitude: item.longitude == null ? "" : String(item.longitude), locationAccuracyMeters: item.locationAccuracyMeters == null ? "" : String(item.locationAccuracyMeters), locationSource: item.locationSource ?? undefined };
}

function Loaded({ value }: { value: ServicePortalData }) {
  const { profile, transition } = useServicePortal();
  const [location, setLocation] = useState(() => locationFrom(value));
  const saveLocation = () => profile.mutate({ googleMapsUrl: location.googleMapsUrl || null, latitude: location.latitude ? Number(location.latitude) : null, longitude: location.longitude ? Number(location.longitude) : null, locationAccuracyMeters: location.locationAccuracyMeters ? Number(location.locationAccuracyMeters) : null, locationSource: location.locationSource ?? null });
  return <main className="mx-auto max-w-6xl space-y-8 p-6"><header><p className="font-semibold text-emerald-700">SERVICE TENANT</p><h1 className="text-3xl font-bold">{value.profile.displayName}</h1></header><section className="rounded-2xl bg-white p-5 shadow"><LocationFields value={location} onChange={setLocation} /><button onClick={saveLocation} disabled={profile.isPending} className="mt-4 min-h-11 rounded-xl bg-emerald-700 px-5 font-semibold text-white">Lưu vị trí</button></section><section><h2 className="text-xl font-bold">Dịch vụ</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{value.services.map((item) => <article key={item.id} className="rounded-xl border bg-white p-4"><h3 className="font-bold">{item.name}</h3><p>{Number(item.unitPrice).toLocaleString("vi-VN")} VND · Chờ {item.waitingMinutes} phút</p><p className="text-sm">Capacity: {item.capacityAvailable ?? "Không giới hạn"} · {item.status}</p></article>)}</div></section><section><h2 className="text-xl font-bold">Đơn hàng</h2><div className="mt-3 space-y-3">{value.orders.map((order) => <article key={order.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><b>{order.orderNumber}</b><p>{order.serviceNameSnapshot} · {order.status}</p></div>{order.status === "PENDING" ? <button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-white" onClick={() => transition.mutate({ orderId: order.id, toStatus: "ACCEPTED" })}>Nhận đơn</button> : null}</div></article>)}</div></section></main>;
}

export function ServicePortalClient() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8">Đang tải…</div>;
  if (data.isError || !data.data) return <div role="alert" className="p-8">Không thể tải Service Portal.</div>;
  return <Loaded key={data.data.profile.locationVerifiedAt ?? "unverified"} value={data.data} />;
}
