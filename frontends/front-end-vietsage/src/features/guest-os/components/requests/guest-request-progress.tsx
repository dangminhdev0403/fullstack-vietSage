import { AnimatePresence, m } from "motion/react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { GuestPortalRequestStatus } from "../../types/guest-os-contract";
import { guestMotionTokens } from "../motion/guest-motion-tokens";
import { getMiddleProgressIcon, getMiddleProgressLabel, getProgressStep, type GuestRequestTranslator } from "./guest-request-display";

export function GuestRequestProgress({ status, t }: { status: GuestPortalRequestStatus; t: GuestRequestTranslator }) {
  const step = getProgressStep(status);
  const items = [
    { label: t("requests.sent"), icon: "check", active: true, complete: true },
    { label: getMiddleProgressLabel(status, t), icon: getMiddleProgressIcon(status), active: step >= 2, complete: step >= 2 },
    { label: t("requests.completed"), icon: "task_alt", active: step >= 3, complete: step >= 3 },
  ];

  return (
    <div aria-label={getMiddleProgressLabel(status, t)} className="py-3">
      <ol className="grid grid-cols-3 gap-2">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} aria-current={index + 1 === step ? "step" : undefined} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
            {index > 0 ? <span aria-hidden="true" className={`absolute right-1/2 top-5 h-1 w-[calc(100%-1rem)] -translate-y-1/2 rounded-full ${item.active ? "bg-[#d7bd61]" : "bg-[#dfe7df]"}`} /> : null}
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={`${status}-${index}`}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: guestMotionTokens.duration.standard }}
                className={`relative z-10 grid size-10 place-items-center rounded-full border ${item.complete ? "border-[#d7bd61] bg-[#fff3bd] text-[#25483f]" : "border-[#dfe7df] bg-[#eef3ee] text-[#647168]"}`}
              >
                <VsIcon name={item.icon} className="text-xl" />
              </m.span>
            </AnimatePresence>
            <span className={`text-xs font-bold leading-4 sm:text-sm ${item.active ? "text-[#18211d]" : "text-[#6b756e]"}`}>{item.label}</span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{getMiddleProgressLabel(status, t)}</p>
    </div>
  );
}
