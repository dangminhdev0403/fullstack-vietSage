import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  staffRoomsRepository,
  type BookingPaymentItem,
  type CollectReceivableInput,
  type CreateBookingPaymentInput,
  type HotelArrivalReservationItem,
  type ListBookingPaymentsQuery,
  type ListReceivablesQuery,
  type ReceivableItem,
  type StaffRoomsListInput,
  type StayFolioContext,
  type TransferStayToReceivableInput,
} from "@/features/hotel-ops/repositories/staff-rooms-repository";
import type {
  BulkReservationInput,
  BulkReservationResult,
  GroupConfirmationData,
  HotelOpsPage,
  HotelRoomSummary,
  ReservationConfirmationData,
} from "@/features/hotel-ops/types/hotel-ops-contract";

const baseStaffRoomsResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "staff-rooms",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (input?: StaffRoomsListInput) => [
        input?.q ?? "",
        input?.status ?? "",
        input?.type ?? "",
        input?.floor ?? "",
        input?.zone ?? "",
        input?.vipOnly ?? false,
        input?.businessDate ?? "",
        input?.page ?? 1,
        input?.limit ?? 50,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        StaffRoomsListInput | void
      >): Promise<HotelOpsPage<HotelRoomSummary>> =>
        staffRoomsRepository.list(scope.hotelId, input || undefined, signal),
    }),
    stayFolio: defineQuery({
      inputKey: (stayId: string) => [stayId],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        string
      >): Promise<StayFolioContext> =>
        staffRoomsRepository.getStayFolioContext(scope.hotelId, input, signal),
    }),
    groupArrivals: defineQuery({
      inputKey: (groupCode: string) => [groupCode],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        string
      >): Promise<HotelArrivalReservationItem[]> =>
        staffRoomsRepository.listGroupArrivals(scope.hotelId, input, signal),
    }),
    reservationConfirmation: defineQuery({
      inputKey: (input: string | { hotelId?: string; reservationId: string }) => [
        typeof input === "string" ? input : input.reservationId,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        string | { hotelId?: string; reservationId: string }
      >): Promise<ReservationConfirmationData> => {
        const reservationId = typeof input === "string" ? input : input.reservationId;
        const resolvedHotelId =
          typeof input === "object" && input?.hotelId ? input.hotelId : scope.hotelId;
        return staffRoomsRepository.getReservationConfirmation(
          resolvedHotelId,
          reservationId,
          signal,
        );
      },
    }),
    groupConfirmation: defineQuery({
      inputKey: (input: string | { hotelId?: string; groupCode: string }) => [
        typeof input === "string" ? input : input.groupCode,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        string | { hotelId?: string; groupCode: string }
      >): Promise<GroupConfirmationData> => {
        const groupCode = typeof input === "string" ? input : input.groupCode;
        const resolvedHotelId =
          typeof input === "object" && input?.hotelId ? input.hotelId : scope.hotelId;
        return staffRoomsRepository.getGroupConfirmation(
          resolvedHotelId,
          groupCode,
          signal,
        );
      },
    }),
    bookingPayments: defineQuery({
      inputKey: (input?: ListBookingPaymentsQuery) => [
        input?.reservationId ?? "",
        input?.groupCode ?? "",
        input?.stayId ?? "",
        input?.paymentType ?? "",
        input?.page ?? 1,
        input?.limit ?? 50,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        ListBookingPaymentsQuery | void
      >): Promise<HotelOpsPage<BookingPaymentItem>> =>
        staffRoomsRepository.listBookingPayments(scope.hotelId, input || undefined, signal),
    }),
    receivables: defineQuery({
      inputKey: (input?: ListReceivablesQuery) => [
        input?.status ?? "",
        input?.debtorType ?? "",
        input?.q ?? "",
        input?.stayId ?? "",
        input?.reservationId ?? "",
        input?.groupCode ?? "",
        input?.page ?? 1,
        input?.limit ?? 50,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        ListReceivablesQuery | void
      >): Promise<HotelOpsPage<ReceivableItem>> =>
        staffRoomsRepository.listReceivables(scope.hotelId, input || undefined, signal),
    }),
  },
  mutations: {
    createBulkReservations: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        BulkReservationInput
      >): Promise<BulkReservationResult> =>
        staffRoomsRepository.createBulkReservations(scope.hotelId, variables),
      invalidates: [{ type: "query", operation: "list" }],
    }),
    createBookingPayment: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<{ hotelId: string }, CreateBookingPaymentInput>) =>
        staffRoomsRepository.createBookingPayment(scope.hotelId, variables),
      invalidates: [
        { type: "query", operation: "bookingPayments" },
        { type: "query", operation: "reservationConfirmation" },
        { type: "query", operation: "groupConfirmation" },
      ],
    }),
    transferStayToReceivable: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        { stayId: string; payload: TransferStayToReceivableInput }
      >) =>
        staffRoomsRepository.transferStayToReceivable(
          scope.hotelId,
          variables.stayId,
          variables.payload,
        ),
      invalidates: [
        { type: "query", operation: "receivables" },
        { type: "query", operation: "stayFolio" },
      ],
    }),
    collectReceivable: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        { receivableId: string; payload: CollectReceivableInput }
      >) =>
        staffRoomsRepository.collectReceivable(
          scope.hotelId,
          variables.receivableId,
          variables.payload,
        ),
      invalidates: [{ type: "query", operation: "receivables" }],
    }),
    checkInReservation: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        { reservationId: string; payload?: Record<string, unknown> }
      >) =>
        staffRoomsRepository.checkInReservation(
          scope.hotelId,
          variables.reservationId,
          variables.payload,
        ),
      invalidates: [
        { type: "query", operation: "list" },
        { type: "query", operation: "groupArrivals" },
      ],
    }),
    checkOutStay: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        { stayId: string; payload?: { nextRoomStatus?: "PROCESSING" | "MAINTENANCE" } }
      >) =>
        staffRoomsRepository.checkOutStay(
          scope.hotelId,
          variables.stayId,
          variables.payload,
        ),
      invalidates: [
        { type: "query", operation: "list" },
        { type: "query", operation: "groupArrivals" },
      ],
    }),
  },
});

export const staffRoomsResource = Object.assign(baseStaffRoomsResource, {
  queries: {
    list: {
      options: (hotelIdOrInput: string | ({ hotelId: string } & StaffRoomsListInput), input?: StaffRoomsListInput) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource.bind({ hotelId: hotelIdOrInput }).queries.list.options(input);
        }
        const { hotelId, ...rest } = hotelIdOrInput;
        return baseStaffRoomsResource.bind({ hotelId }).queries.list.options(rest);
      },
    },
    stayFolio: {
      options: (hotelIdOrInput: string | { hotelId: string; stayId: string }, stayId?: string) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource.bind({ hotelId: hotelIdOrInput }).queries.stayFolio.options(stayId ?? "");
        }
        return baseStaffRoomsResource
          .bind({ hotelId: hotelIdOrInput.hotelId })
          .queries.stayFolio.options(hotelIdOrInput.stayId);
      },
    },
    groupArrivals: {
      options: (hotelIdOrInput: string | { hotelId: string; groupCode: string }, groupCode?: string) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource.bind({ hotelId: hotelIdOrInput }).queries.groupArrivals.options(groupCode ?? "");
        }
        return baseStaffRoomsResource
          .bind({ hotelId: hotelIdOrInput.hotelId })
          .queries.groupArrivals.options(hotelIdOrInput.groupCode);
      },
    },
    reservationConfirmation: {
      options: (
        hotelIdOrInput: string | { hotelId: string; reservationId: string },
        reservationId?: string,
      ) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource
            .bind({ hotelId: hotelIdOrInput })
            .queries.reservationConfirmation.options(reservationId ?? "");
        }
        return baseStaffRoomsResource
          .bind({ hotelId: hotelIdOrInput.hotelId })
          .queries.reservationConfirmation.options(hotelIdOrInput.reservationId);
      },
    },
    groupConfirmation: {
      options: (
        hotelIdOrInput: string | { hotelId: string; groupCode: string },
        groupCode?: string,
      ) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource
            .bind({ hotelId: hotelIdOrInput })
            .queries.groupConfirmation.options(groupCode ?? "");
        }
        return baseStaffRoomsResource
          .bind({ hotelId: hotelIdOrInput.hotelId })
          .queries.groupConfirmation.options(hotelIdOrInput.groupCode);
      },
    },
    bookingPayments: {
      options: (
        hotelIdOrInput: string | ({ hotelId: string } & ListBookingPaymentsQuery),
        query?: ListBookingPaymentsQuery,
      ) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource
            .bind({ hotelId: hotelIdOrInput })
            .queries.bookingPayments.options(query);
        }
        const { hotelId, ...rest } = hotelIdOrInput;
        return baseStaffRoomsResource.bind({ hotelId }).queries.bookingPayments.options(rest);
      },
    },
    receivables: {
      options: (
        hotelIdOrInput: string | ({ hotelId: string } & ListReceivablesQuery),
        query?: ListReceivablesQuery,
      ) => {
        if (typeof hotelIdOrInput === "string") {
          return baseStaffRoomsResource
            .bind({ hotelId: hotelIdOrInput })
            .queries.receivables.options(query);
        }
        const { hotelId, ...rest } = hotelIdOrInput;
        return baseStaffRoomsResource.bind({ hotelId }).queries.receivables.options(rest);
      },
    },
  },
});
