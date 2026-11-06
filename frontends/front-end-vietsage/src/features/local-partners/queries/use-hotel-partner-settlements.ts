"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { showErrorAlert } from "@/libs/swal";
import { hotelPartnerSettlementsResource } from "../resources/hotel-partner-settlements-resource";

export function useHotelPartnerSettlements(hotelId: string) {
  const resource = hotelPartnerSettlementsResource.bind({ hotelId });
  const list = useQuery({ ...resource.queries.list.options(undefined), enabled: Boolean(hotelId) });
  const revenue = useQuery({ ...resource.queries.revenue.options(undefined), enabled: Boolean(hotelId) });
  const settle = useMutation(resource.mutations.settle.options());
  const settleBatch = useMutation(resource.mutations.settleBatch.options());

  useEffect(() => {
    if (list.error) void showErrorAlert("Lỗi tải dữ liệu", list.error.message || "Đã có lỗi xảy ra");
  }, [list.error, list.errorUpdatedAt]);

  return { list, revenue, settle, settleBatch };
}
