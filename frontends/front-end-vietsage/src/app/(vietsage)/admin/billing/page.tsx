import type { Metadata } from "next";
import { AdminBillingClient } from "./admin-billing-client";

export const metadata: Metadata = {
  title: "Quản lý Phí VietSage SaaS | VietSage Admin",
  description: "Quản lý hợp đồng tính phí VietSage SaaS, xem tổng quan doanh thu và chốt hóa đơn.",
};

export default function AdminBillingPage() {
  return <AdminBillingClient />;
}
