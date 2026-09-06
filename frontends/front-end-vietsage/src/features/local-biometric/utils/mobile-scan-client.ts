import type { MobileShiftView } from "../workstation/mobile-shift-store";
export function mayApplyMobile(view: MobileShiftView, targetKey: string, now = Date.now()) {
  return view.phase === "active" && view.expiresAt > now && view.target?.key === targetKey
    && view.target.expiresAt > now && view.target.status === "received" && !!view.payload
    && view.target.transferId === view.payload.transferId;
}
