import { notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";

import { ownerAccessMessage } from "../../../_components/owner-auth";
import { OwnerHotelDetailClient } from "./owner-hotel-detail-client";

const settingsLinks = [
  { path: "rooms", icon: "QR", title: "Phòng & QR", description: "Cấu hình phòng, giá niêm yết, thiết bị và mã QR GuestOS.", global: false },
  { path: "staff", icon: "NS", title: "Nhân viên", description: "Quản lý tài khoản, vai trò và phạm vi làm việc của nhân viên.", global: true },
  { path: "services", icon: "DV", title: "Danh mục dịch vụ", description: "Cấu hình nhóm dịch vụ, giá và nội dung GuestOS.", global: false },
  { path: "partners", icon: "ĐT", title: "Kết nối đối tác", description: "Chọn đối tác dịch vụ hiển thị cho khách lưu trú.", global: false },
  { path: "kbtt?tab=connection", icon: "BCA", title: "Kết nối Bộ Công an", description: "Quản lý kết nối BCA; hồ sơ khai báo chỉ để theo dõi.", global: false },
] as const;

type OwnerHotelPageProps = {
  params: Promise<{ hotelId: string }>;
};

export const dynamic = "force-dynamic";

async function getOwnerVisibleHotel(hotelId: string, accessToken: string | undefined): Promise<Hotel | null> {
  const hotelsPage = await adminService.listHotels({
    query: { page: 1, limit: 100 },
    accessToken,
  });

  return hotelsPage.items.find((item) => item.id === hotelId) ?? null;
}

export default async function OwnerHotelPage({ params }: OwnerHotelPageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  
  let hotel: Hotel | null;

  try {
    [hotel] = await Promise.all([
      authorizedApi("get owner visible hotel", (accessToken) => getOwnerVisibleHotel(hotelId, accessToken)),
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }

    return (
      <>
        <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
          {ownerAccessMessage(error)}
        </section>
      </>
    );
  }

  if (!hotel) {
    notFound();
  }

  return (
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">KHÁCH SẠN</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">{hotel.name}</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Quản lý dữ liệu nền, quyền truy cập và các kết nối của khách sạn.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Thiết lập và kết nối">
        {settingsLinks.map((item) => (
          <Link
            key={item.path}
            href={item.global ? "/owner/staff" : `/owner/hotels/${encodeURIComponent(hotelId)}/${item.path}`}
            className="group rounded-2xl border border-[#e5ddcd] bg-[#fffcf7] p-5 shadow-[0_8px_24px_rgba(23,32,27,0.06)] transition hover:-translate-y-0.5 hover:border-[#d7bd61] hover:shadow-[0_14px_32px_rgba(23,32,27,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c6d29]"
          >
            <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[#17201b] px-3 text-sm font-black text-[#e8b363]">
              {item.icon}
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#17201b]">{item.title}</h2>
            <p className="mt-2 text-base leading-6 text-[#5a6760]">{item.description}</p>
            <span className="mt-4 inline-flex text-sm font-bold text-[#25483f] group-hover:underline">Mở thiết lập</span>
          </Link>
        ))}
      </section>

      <OwnerHotelDetailClient hotel={hotel} />
    </>
  );
}
