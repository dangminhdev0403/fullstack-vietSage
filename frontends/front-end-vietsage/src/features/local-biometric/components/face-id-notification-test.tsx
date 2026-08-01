"use client";

import { useEffect, useState } from "react";

export function FaceIdNotificationTest({ hotelId }: { hotelId: string }) {
  const [eventAt, setEventAt] = useState<string | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(`face-id-test:${hotelId}`);
    channel.onmessage = (event: MessageEvent<{ occurredAt?: string }>) => setEventAt(event.data.occurredAt ?? null);
    return () => channel.close();
  }, [hotelId]);

  function sendTestEvent() {
    const occurredAt = new Date().toLocaleString("vi-VN");
    setEventAt(occurredAt);
    const channel = new BroadcastChannel(`face-id-test:${hotelId}`);
    channel.postMessage({ occurredAt });
    channel.close();
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm">
      <div>
        <h2 className="vs-display text-xl font-semibold text-[var(--primary)]">Kiểm tra thông báo FaceID</h2>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Tạo Sự kiện kiểm thử cho đúng khách sạn đang mở. Không phải sự kiện từ thiết bị thật.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <span className="font-semibold text-slate-600">Hotel ID</span>
        <code className="ml-2 break-all font-bold text-slate-950">{hotelId}</code>
      </div>

      <button
        type="button"
        onClick={sendTestEvent}
        className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white"
      >
        Gửi thông báo kiểm thử
      </button>

      {eventAt ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <p className="font-bold">Thông báo FaceID · Sự kiện kiểm thử</p>
          <p className="mt-1 text-sm">Khách sạn: {hotelId}</p>
          <p className="mt-1 text-sm">Thời gian: {eventAt}</p>
        </div>
      ) : null}
    </section>
  );
}