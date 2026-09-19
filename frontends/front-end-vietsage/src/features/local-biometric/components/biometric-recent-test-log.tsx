"use client";

import React, { useState } from "react";
import type { IntakePayloadV2 } from "../intake/intake-contract";

export type TestScanRecord = {
  id: string;
  timestamp: string;
  source: "HN-212" | "Mobile QR";
  guestName: string;
  maskedId: string;
  speedMs: number;
  chipValid: boolean;
  payload: IntakePayloadV2;
};

const INITIAL_RECORDS: TestScanRecord[] = [
  {
    id: "scan-01",
    timestamp: "10 phút trước",
    source: "HN-212",
    guestName: "NGUYỄN VĂN AN",
    maskedId: "001098***412",
    speedMs: 780,
    chipValid: true,
    payload: {
      schemaVersion: 2,
      transferId: "00000000-0000-4000-8000-000000000001",
      capturedAt: new Date(Date.now() - 10 * 60000).toISOString(),
      guest: {
        displayName: "NGUYỄN VĂN AN",
        identityNumber: "001098012412",
        dateOfBirth: "1994-08-15",
        gender: "Nam",
        nationality: "Việt Nam",
        race: "Kinh",
        residencePlace: "Số 25 Phố Huế, Hàng Bài, Hoàn Kiếm, Hà Nội",
        identityIssueDate: "2021-09-10",
        identityExpiryDate: "2034-08-15",
      },
      verification: {
        chipAuthenticated: true,
        sodVerified: true,
      },
    },
  },
  {
    id: "scan-02",
    timestamp: "25 phút trước",
    source: "Mobile QR",
    guestName: "TRẦN THỊ HƯƠNG",
    maskedId: "034195***890",
    speedMs: 920,
    chipValid: false,
    payload: {
      schemaVersion: 2,
      transferId: "00000000-0000-4000-8000-000000000002",
      capturedAt: new Date(Date.now() - 25 * 60000).toISOString(),
      guest: {
        displayName: "TRẦN THỊ HƯƠNG",
        identityNumber: "034195009890",
        dateOfBirth: "1995-11-22",
        gender: "Nữ",
        nationality: "Việt Nam",
        race: "Kinh",
        residencePlace: "128 Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh",
        identityIssueDate: "2022-04-18",
        identityExpiryDate: "2035-11-22",
      },
      verification: {
        chipAuthenticated: false,
        sodVerified: false,
      },
    },
  },
];

type Props = {
  onSelectRecord?: (record: TestScanRecord) => void;
};

export function BiometricRecentTestLog({ onSelectRecord }: Props) {
  const [records, setRecords] = useState<TestScanRecord[]>(INITIAL_RECORDS);

  const handleClearAll = () => {
    setRecords([]);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-stone-100">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#00003c]">
              Nhật ký kiểm thử thiết bị trong ca
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-stone-500">
              Ghi nhận tạm thời các lượt quét mẫu. Dữ liệu tự động làm mới sau khi đóng trình duyệt.
            </p>
          </div>
        </div>

        {records.length > 0 ? (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-stone-600 shadow-2xs transition-colors hover:bg-stone-50 hover:text-red-700 hover:border-red-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Xóa nhật ký ca trực</span>
          </button>
        ) : null}
      </div>

      <div className="mt-6">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-50 text-stone-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-700">Chưa có lượt quét test nào</p>
            <p className="mt-1 text-xs text-stone-500">Hãy đặt thẻ vào máy HN-212 hoặc quét qua điện thoại để chạy test đầu tiên.</p>
            <button
              type="button"
              onClick={() => setRecords(INITIAL_RECORDS)}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-stone-100 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-200"
            >
              Nạp lại 2 bản ghi mẫu
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-xs font-bold uppercase tracking-wider text-stone-400">
                  <th scope="col" className="pb-3 pr-4 font-bold">Thời gian</th>
                  <th scope="col" className="pb-3 px-4 font-bold">Thiết bị</th>
                  <th scope="col" className="pb-3 px-4 font-bold">Thông tin CCCD</th>
                  <th scope="col" className="pb-3 px-4 font-bold">Phản hồi</th>
                  <th scope="col" className="pb-3 px-4 font-bold">Trạng thái</th>
                  <th scope="col" className="pb-3 pl-4 text-right font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {records.map((item) => (
                  <tr key={item.id} className="group transition-colors hover:bg-stone-50/70">
                    <td className="py-4 pr-4 text-xs font-semibold text-stone-500 whitespace-nowrap">
                      {item.timestamp}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
                        item.source === "HN-212"
                          ? "bg-blue-50 text-[#000080]"
                          : "bg-amber-50 text-[#735c00]"
                      }`}>
                        {item.source === "HN-212" ? (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <rect x="5" y="2" width="14" height="20" rx="3" strokeWidth={2} />
                          </svg>
                        )}
                        {item.source}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-bold text-[#00003c]">{item.guestName}</p>
                        <p className="font-mono text-xs text-stone-500">{item.maskedId}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-xs font-semibold text-stone-600 whitespace-nowrap">
                      {item.speedMs} ms
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {item.chipValid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                          <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Đạt chuẩn Chip
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                          QR thông thường
                        </span>
                      )}
                    </td>
                    <td className="py-4 pl-4 text-right whitespace-nowrap">
                      {onSelectRecord ? (
                        <button
                          type="button"
                          onClick={() => onSelectRecord(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 shadow-2xs hover:border-[#000080] hover:text-[#000080]"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>Xem thẻ</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
