import type { GuestRequest } from "../../types/guest-os-contract";
import { GuestStagger, GuestStaggerItem } from "../motion/guest-stagger";
import type { GuestRequestTranslator } from "./guest-request-display";
import { GuestRequestCard } from "./guest-request-card";

type Props = { requests: GuestRequest[]; selectedRequestId?: string; intlLocale: string; isCancelling: boolean; t: GuestRequestTranslator; onSelect: (id: string) => void; onCancel: (request: GuestRequest) => void };

export function GuestRequestList({ requests, selectedRequestId, intlLocale, isCancelling, t, onSelect, onCancel }: Props) {
  return <GuestStagger className="grid gap-5 md:grid-cols-2">{requests.map((request) => <GuestStaggerItem key={request.id}><GuestRequestCard request={request} selected={selectedRequestId === request.id} intlLocale={intlLocale} isCancelling={isCancelling} t={t} onSelect={onSelect} onCancel={onCancel} /></GuestStaggerItem>)}</GuestStagger>;
}
