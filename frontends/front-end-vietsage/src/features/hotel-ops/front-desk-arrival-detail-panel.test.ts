import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type { HotelArrival } from "./types/hotel-ops-contract.ts";

const panelSource = readFileSync(
  new URL("./components/front-desk-arrival-detail-panel.tsx", import.meta.url),
  "utf8",
);
const arrivalsTableSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/front-desk-arrivals-table.tsx", import.meta.url),
  "utf8",
);
const frontDeskPageSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/page.tsx", import.meta.url),
  "utf8",
);

test("FrontDeskArrivalDetailPanel enforces accessibility and dialog contract", () => {
  // Accessible modal attributes
  assert.match(panelSource, /role="dialog"/);
  assert.match(panelSource, /aria-modal="true"/);
  assert.match(panelSource, /aria-labelledby=/);
  assert.match(panelSource, /aria-describedby=/);

  // Focus trap and Escape key listener
  assert.match(panelSource, /event\.key === "Escape"/);
  assert.match(panelSource, /event\.key === "Tab"/);

  // Focus return to trigger element
  assert.match(panelSource, /const triggerEl = triggerElementRef\?\.current/);
  assert.match(panelSource, /triggerEl\?\.focus\(\)/);

  // Touch target minimum 44px
  assert.match(panelSource, /min-h-\[44px\]/);
});

test("FrontDeskArrivalsTable wires row click and keyboard Enter/Space without forcing redirect", () => {
  // Row button contract
  assert.match(arrivalsTableSource, /role="button"/);
  assert.match(arrivalsTableSource, /tabIndex=\{0\}/);
  assert.match(arrivalsTableSource, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(arrivalsTableSource, /setSelectedArrival\(arrival\)/);
  assert.match(arrivalsTableSource, /lastFocusedTriggerRef\.current = e\.currentTarget/);

  // Strictly avoid depending on router.push or redirect link in table row
  assert.doesNotMatch(arrivalsTableSource, /router\.push/);
  assert.doesNotMatch(arrivalsTableSource, /targetHref/);

  // Mounts FrontDeskArrivalDetailPanel
  assert.match(arrivalsTableSource, /<FrontDeskArrivalDetailPanel/);
});

test("front-desk page.tsx passes explicit capability props to FrontDeskArrivalsTable", () => {
  assert.match(frontDeskPageSource, /canOperateArrivals=\{canOperateArrivals\}/);
  assert.match(frontDeskPageSource, /canCheckInStay=\{canCheckInStay\}/);
  assert.match(frontDeskPageSource, /canManageReservations=\{canManageReservations\}/);
});

test("FrontDeskArrivalDetailPanel room assignment dropdown complies with Frontend Dropdown Rule", () => {
  // Dropdown element for selecting room
  assert.match(panelSource, /<select\s+id="arrival-assign-room-select"/);

  // Renders human-readable room number and room type
  assert.match(panelSource, /Phòng \{r\.roomNumber/);

  // Does not ask user to manually type UUID
  assert.doesNotMatch(panelSource, /Nhập mã phòng/);
});

test("FrontDeskArrivalDetailPanel check-in and room assignment API isolation", () => {
  assert.match(panelSource, /staffRoomsResource\.bind\(\{ hotelId \}\)\.mutations\.checkInReservation\.options\(\)/);

  // Room assignment API call
  assert.match(
    panelSource,
    /staffRoomsRepository\.assignReservationRoom\(hotelId, arrival\.id,/,
  );

  // Realtime query cache invalidation
  assert.match(panelSource, /invalidateHotelRealtimeQueries\(queryClient, hotelId\)/);

  // Timezone standard
  assert.match(panelSource, /timeZone: hotelTimezone/);
  assert.match(panelSource, /priorityAlerts\?\.timezone/);
});

test("FrontDeskArrivalsTable does not use misleading action labels as status and uses getArrivalStatusDisplay", () => {
  // Uses getArrivalStatusDisplay
  assert.match(arrivalsTableSource, /getArrivalStatusDisplay/);

  // Does not use hardcoded action button label "Nhận phòng ngay" or informal "Đến ngày mới mở" in status column
  assert.doesNotMatch(arrivalsTableSource, /<span>Nhận phòng ngay<\/span>/);
  assert.doesNotMatch(arrivalsTableSource, /Đến ngày mới mở/);
});

test("getArrivalStatusDisplay accurately determines hospitality statuses", async () => {
  // @ts-expect-error Node's strip-types runner requires explicit extension
  const { getArrivalStatusDisplay } = await import("./utils/hotel-ops-display.ts");

  const today = "2026-10-15";

  // Case 1: Room not yet assigned -> "Chờ gán phòng" regardless of date
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "CONFIRMED",
        roomId: null,
        plannedCheckInAt: "2026-10-15T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Chờ gán phòng",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
      dotClass: "bg-amber-500",
    },
  );

  // Case 2: Room assigned and check-in date is today -> "Sẵn sàng đón khách"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "ARRIVAL_READY",
        roomId: "room-1009",
        plannedCheckInAt: "2026-10-15T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Sẵn sàng đón khách",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dotClass: "bg-emerald-500",
    },
  );

  // Case 3: Room assigned and check-in date is future -> "Đã xác nhận"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "ARRIVAL_READY",
        roomId: "room-1007",
        plannedCheckInAt: "2026-10-16T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Đã xác nhận",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
      dotClass: "bg-blue-500",
    },
  );

  // Case 4: Room assigned and check-in date is in the past -> "Quá hạn nhận phòng"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "ARRIVAL_READY",
        roomId: "room-1007",
        plannedCheckInAt: "2026-10-14T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Quá hạn nhận phòng",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      dotClass: "bg-rose-500 animate-pulse",
    },
  );

  // Case 5: Already checked in -> "Đã nhận phòng"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "CHECKED_IN",
        roomId: "room-1007",
        plannedCheckInAt: "2026-10-15T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Đã nhận phòng",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      dotClass: "bg-slate-400",
    },
  );
});

test("FrontDeskArrivalDetailPanel check-in uses stale guards and explicit confirmation flags", () => {
  assert.match(panelSource, /expectedRoomId: activeArrival\.roomId/);
  assert.match(panelSource, /expectedUpdatedAt: activeArrival\.updatedAt/);
  assert.match(panelSource, /handleConfirmCheckIn\(\{ confirmLateCheckIn: true \}\)/);
  assert.match(panelSource, /<GroupCheckInModal/);
});

test("formatFriendlyCheckInError handles conflict refetch guidance, cancelled, already-checked-in, and idempotent replay", async () => {
  // @ts-expect-error Node strip-types requires file extension
  const { formatFriendlyCheckInError } = await import("./utils/check-in-error.ts");

  // Conflict / stale error gives actionable refetch guidance
  const conflictMsg = formatFriendlyCheckInError("ROOM_CHECK_IN_CONFLICT");
  assert.match(conflictMsg, /Xung đột dữ liệu nhận phòng/);
  assert.match(conflictMsg, /Vui lòng tải lại dữ liệu/);

  // Early check in error explains future arrival date
  const earlyMsg = formatFriendlyCheckInError("EARLY_CHECK_IN_NOT_ALLOWED");
  assert.match(earlyMsg, /Chưa tới ngày nhận phòng dự kiến/);
  assert.match(earlyMsg, /nhận phòng sớm/);

  // Cancelled reservation returns actionable Vietnamese guidance
  const cancelledMsg = formatFriendlyCheckInError("RESERVATION_CANCELLED");
  assert.match(cancelledMsg, /Đơn đặt phòng này đã bị hủy/);
  assert.match(cancelledMsg, /tạo đơn đặt phòng mới/);

  // Already checked in returns actionable Vietnamese guidance
  const checkedInMsg = formatFriendlyCheckInError("ALREADY_CHECKED_IN");
  assert.match(checkedInMsg, /hoàn tất nhận phòng trước đó/);
  assert.match(checkedInMsg, /tải lại trang/);

  // Idempotent replay returns actionable synchronization confirmation
  const idempotentMsg = formatFriendlyCheckInError("IDEMPOTENT_REPLAY");
  assert.match(idempotentMsg, /xử lý thành công trước đó/);
  assert.match(idempotentMsg, /đồng bộ an toàn/);
});

type TestNode = { type: unknown; props: Record<string, unknown> };
type DialogPlan = { isConfirmed?: boolean; isDenied?: boolean; select?: string; details?: string };

function renderArrivalPanel(options: {
  arrival?: Partial<HotelArrival>;
  dialogs?: DialogPlan[];
  canCheckInStay?: boolean;
  canManageReservations?: boolean;
  activeStay?: Record<string, unknown>;
  failMutation?: boolean;
  hotelTimezone?: string;
  businessDate?: string;
  calendarError?: boolean;
  paymentError?: boolean;
} = {}) {
  const arrival: HotelArrival = {
    id: "selected-reservation", hotelId: "hotel-1", reservationCode: "RES-1", groupCode: "GRP-1",
    roomId: "room-1", room: { id: "room-1", roomNumber: "101", type: "Deluxe", status: "AVAILABLE" },
    guestDisplayName: "Nguyễn <An>", guestPhone: null, status: "CONFIRMED",
    plannedCheckInAt: "2026-11-12T07:00:00.000Z", plannedCheckOutAt: "2026-11-15T05:00:00.000Z",
    updatedAt: "2026-11-12T06:00:00.000Z", ...options.arrival,
  };
  const state: unknown[] = [];
  let cursor = 0;
  let details = "";
  let closed = 0;
  let invalidated = 0;
  const calls: Array<{ operation: string; args: unknown[] }> = [];
  const dialogs: Record<string, unknown>[] = [];
  const warnings: unknown[][] = [];
  const errors: unknown[][] = [];
  const plans = [...(options.dialogs ?? [])];
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): TestNode => ({ type, props: { ...props, children } }),
    Fragment: "Fragment",
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useMemo: (fn: () => unknown) => fn(), useEffect() {}, useRef: () => ({ current: null }), useId: () => "arrival-panel",
  };
  const mutate = async (operation: string, ...args: unknown[]) => {
    calls.push({ operation, args: structuredClone(args) });
    if (options.failMutation) throw new Error("Phòng đã được cập nhật. Vui lòng tải lại.");
    return {};
  };
  const swal = {
    SwalVietSage: {
      isVisible: () => false,
      async fire(config: Record<string, unknown>) {
        dialogs.push(config);
        const plan = plans.shift() ?? {};
        details = plan.details ?? "";
        const value = plan.select !== undefined
          ? (config.preConfirm as (value: string) => unknown)(plan.select)
          : undefined;
        return { ...plan, value, isConfirmed: Boolean(plan.isConfirmed && value !== false) };
      },
      getPopup: () => ({ querySelector: () => ({ value: details }) }),
      showValidationMessage: (message: string) => warnings.push([message]),
    },
    escapeHtml: (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    showWarningAlert: async (...args: unknown[]) => { warnings.push(args); },
    showErrorAlert: async (...args: unknown[]) => { errors.push(args); },
    showSuccessAlert: async () => {}, showConfirmDialog: async () => ({ isConfirmed: false }),
    SWAL_DANGER_BTN_CLASS: "text-base",
  };
  const queryOptions = (kind: string) => ({ options: () => ({ kind }) });
  const resource = { bind: () => ({
    queries: { priorityAlerts: queryOptions("calendar"), allRooms: queryOptions("rooms"), bookingPayments: queryOptions("payments"), receivables: queryOptions("receivables") },
    mutations: { checkInReservation: queryOptions("check-in") },
  }) };
  const { outputText, diagnostics } = ts.transpileModule(panelSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics?.length, 0, "panel must transpile without syntax errors");
  const mod = { exports: {} as { FrontDeskArrivalDetailPanel: (props: Record<string, unknown>) => TestNode } };
  const run = vm.runInNewContext(`(function(require, module, exports) { ${outputText}\n })`, { Intl, Date, Number, Boolean, String, Math, Object, Array });
  run((id: string) => {
    if (id === "react") return { ...react, default: react, __esModule: true };
    if (id === "next/link") return { default: "Link", __esModule: true };
    if (id === "@tanstack/react-query") return {
      useQueryClient: () => ({}),
      useMutation: () => ({ mutateAsync: (variables: unknown) => mutate("check-in", variables) }),
      useQuery: ({ kind }: { kind: string }) => ({
        data: kind === "calendar" ? {
          timezone: options.hotelTimezone ?? "Asia/Ho_Chi_Minh", businessDate: options.businessDate ?? "2026-11-13",
        } : { items: kind === "rooms" ? [{
          id: "room-1", roomNumber: "101", status: "AVAILABLE", activeStay: options.activeStay,
        }] : kind === "payments" ? [{ amount: 400000, receivedAmount: 350000, paymentMethod: "CASH", paymentType: "DEPOSIT" }] : [] },
        refetch: async () => {}, isPending: false,
        isError: kind === "calendar" ? options.calendarError : kind === "payments" ? options.paymentError : false,
      }),
    };
    if (id.endsWith("/staff-rooms-resource")) return { staffRoomsResource: resource };
    if (id.endsWith("/staff-rooms-repository")) return { staffRoomsRepository: {
      cancelReservation: (...args: unknown[]) => mutate("cancel", ...args),
      markNoShowReservation: (...args: unknown[]) => mutate("no-show", ...args),
    } };
    if (id.endsWith("/invalidate-hotel-realtime-queries")) return { invalidateHotelRealtimeQueries: async () => { invalidated++; } };
    if (id.endsWith("/vietnam-temporal")) return { toVietnamYmd: (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) };
    if (id.endsWith("/swal")) return swal;
    if (id.endsWith("/hotel-ops-display")) return { getArrivalStatusDisplay: () => ({ label: "Đã xác nhận" }) };
    if (id.endsWith("/check-in-error")) return { formatFriendlyCheckInError: (err: Error) => err.message, formatFriendlyHotelOpsError: (err: Error) => err.message };
    return new Proxy({}, { get: (_target, name) => name });
  }, mod, mod.exports);
  function render() {
    cursor = 0;
    return mod.exports.FrontDeskArrivalDetailPanel({
      isOpen: true, hotelId: "hotel-1", arrival, todayYmd: "2026-11-13", onClose: () => closed++,
      canManageReservations: options.canManageReservations ?? true, canCheckInStay: options.canCheckInStay ?? true,
    });
  }
  function nodes(value: unknown): TestNode[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object" || !("props" in value)) return [];
    const element = value as TestNode;
    return [element, ...nodes(element.props.children)];
  }
  function text(value: unknown): string {
    if (Array.isArray(value)) return value.map(text).join("");
    if (typeof value === "string" || typeof value === "number") return String(value);
    return value && typeof value === "object" && "props" in value ? text((value as TestNode).props.children) : "";
  }
  return {
    calls, dialogs, warnings, errors,
    get closed() { return closed; }, get invalidated() { return invalidated; },
    buttons: (label: string) => nodes(render()).filter((node) => node.type === "button" && text(node) === label),
    async click(label: string) {
      const button = this.buttons(label)[0];
      assert.ok(button, `missing action: ${label}`);
      await (button.props.onClick as () => unknown)();
    },
    editIsOpen: () => nodes(render()).some((node) => node.type === "EditReservationModal" && node.props.isOpen === true),
  };
}

test("overdue header and footer open centered resolution with escaped identity and received deposit", async () => {
  const panel = renderArrivalPanel();
  assert.equal(panel.buttons("Xử lý quá hạn").length, 2);
  assert.equal(panel.buttons("Hủy đặt phòng").length, 1);
  await panel.click("Xử lý quá hạn");
  assert.equal(panel.dialogs[0].title, "Xử lý đặt phòng quá hạn");
  assert.equal(panel.dialogs[0].position, "center");
  assert.match(String(panel.dialogs[0].html), /Nguyễn &lt;An&gt;/);
  assert.match(String(panel.dialogs[0].html), /350\.000/);
  assert.match(String(panel.dialogs[0].html), /bảo toàn trong báo cáo doanh thu\/cọc/);
  assert.equal(panel.calls.length, 0, "dismissing resolution must not mutate reservations");
});

for (const checkout of ["2026-11-12T05:00:00.000Z", "2026-11-13T16:00:00.000Z"]) {
  test(`expired calendar schedule ${checkout} opens editor without check-in`, async () => {
    const panel = renderArrivalPanel({ arrival: { plannedCheckOutAt: checkout }, dialogs: [{ isConfirmed: true }] });
    await panel.click("Xử lý quá hạn");
    assert.equal(panel.dialogs[1].title, "Lịch lưu trú đã hết hạn");
    assert.equal(panel.editIsOpen(), true);
    assert.equal(panel.calls.length, 0);
  });
}

test("hotel calendar conversion handles midnight before testing expiration", async () => {
  const panel = renderArrivalPanel({ arrival: { plannedCheckOutAt: "2026-11-13T17:00:00.000Z" }, dialogs: [{ isConfirmed: true }] });
  await panel.click("Xử lý quá hạn");
  assert.equal(panel.calls[0].operation, "check-in");
});

test("overdue and expiration checks use the hotel's timezone and business date", async () => {
  const panel = renderArrivalPanel({
    hotelTimezone: "America/Los_Angeles", businessDate: "2026-11-13",
    arrival: {
      plannedCheckInAt: "2026-11-13T00:30:00.000Z",
      plannedCheckOutAt: "2026-11-14T00:30:00.000Z",
    },
    dialogs: [{ isConfirmed: true }],
  });
  await panel.click("Xử lý quá hạn");
  assert.equal(panel.dialogs[1].title, "Lịch lưu trú đã hết hạn");
  assert.equal(panel.editIsOpen(), true);
  assert.equal(panel.calls.length, 0);
});

for (const unavailable of ["calendarError", "paymentError"] as const) {
  test(`overdue resolution fails closed when ${unavailable} prevents a truthful summary`, async () => {
    const panel = renderArrivalPanel({ [unavailable]: true });
    await panel.click("Xử lý quá hạn");
    assert.equal(panel.dialogs.length, 0);
    assert.equal(panel.errors.length, 1);
    assert.equal(panel.calls.length, 0);
  });
}

test("unassigned overdue arrival opens editor before attempting check-in", async () => {
  const panel = renderArrivalPanel({ arrival: { roomId: null, room: null }, dialogs: [{ isConfirmed: true }] });
  await panel.click("Xử lý quá hạn");
  assert.equal(panel.warnings[0][0], "Chưa gán phòng");
  assert.equal(panel.editIsOpen(), true);
  assert.equal(panel.calls.length, 0);
});

test("confirmed late check-in targets only the selected group member with stale guards", async () => {
  const panel = renderArrivalPanel({ dialogs: [{ isConfirmed: true }] });
  await panel.click("Xử lý quá hạn");
  assert.deepEqual(panel.calls, [{ operation: "check-in", args: [{
    reservationId: "selected-reservation", payload: {
      expectedRoomId: "room-1", expectedUpdatedAt: "2026-11-12T06:00:00.000Z", confirmLateCheckIn: true,
    },
  }] }]);
  assert.equal(panel.invalidated, 1);
  assert.equal(panel.closed, 1);
});

for (const [select, operation, reason] of [
  ["NO_SHOW", "no-show", "Khách không đến (No-show): Không liên lạc được"],
  ["GUEST_CANCELLED", "cancel", "Khách báo hủy: Không liên lạc được"],
]) {
  test(`unified cancellation routes ${select} with optional reason and deposit retention`, async () => {
    const panel = renderArrivalPanel({ dialogs: [{ isDenied: true }, { isConfirmed: true, select, details: "  Không liên lạc được  " }] });
    await panel.click("Xử lý quá hạn");
    assert.equal(panel.dialogs[1].input, "select");
    assert.match(String(panel.dialogs[1].html), /bảo toàn/);
    assert.deepEqual(panel.calls, [{ operation, args: ["hotel-1", "selected-reservation", { reason }] }]);
    assert.equal(panel.closed, 1);
  });
}

test("cancellation without detail retains the selected reason", async () => {
  const panel = renderArrivalPanel({ dialogs: [{ isConfirmed: true, select: "GUEST_CANCELLED" }] });
  await panel.click("Hủy đặt phòng");
  assert.deepEqual(panel.calls[0].args[2], { reason: "Khách báo hủy" });
});

test("cancellation requires a valid reason selection", async () => {
  const panel = renderArrivalPanel({ dialogs: [{ isConfirmed: true, select: "" }] });
  await panel.click("Hủy đặt phòng");
  assert.equal(panel.calls.length, 0);
  assert.equal(panel.closed, 0);
  assert.equal(panel.warnings.length, 1);
});

test("cancellation validates the complete reason against the API's 500-character limit", async () => {
  const panel = renderArrivalPanel({ dialogs: [{ isConfirmed: true, select: "NO_SHOW", details: "x".repeat(500) }] });
  await panel.click("Hủy đặt phòng");
  assert.equal(panel.calls.length, 0);
  assert.equal(panel.warnings[0][0], "Lý do hủy tối đa 500 ký tự.");
});

test("check-in failures keep the panel open with a recovery message", async () => {
  const panel = renderArrivalPanel({ dialogs: [{ isConfirmed: true }], failMutation: true });
  await panel.click("Xử lý quá hạn");
  assert.equal(panel.errors[0][0], "Không thể nhận phòng");
  assert.equal(panel.closed, 0);
});

test("checked-in member with an active stay has no overdue or cancellation actions", () => {
  const panel = renderArrivalPanel({ arrival: { status: "CHECKED_IN" }, activeStay: {
    id: "stay-1", reservationCode: "RES-1", status: "ACTIVE", checkedOutAt: null,
  } });
  assert.equal(panel.buttons("Xử lý quá hạn").length, 0);
  assert.equal(panel.buttons("Hủy đặt phòng").length, 0);
});

test("overdue actions remain hidden without management or check-in permission", () => {
  const panel = renderArrivalPanel({ canCheckInStay: false, canManageReservations: false });
  assert.equal(panel.buttons("Xử lý quá hạn").length, 0);
  assert.equal(panel.buttons("Hủy đặt phòng").length, 0);
});
