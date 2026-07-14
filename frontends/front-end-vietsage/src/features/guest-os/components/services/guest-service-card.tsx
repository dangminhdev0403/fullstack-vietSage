import { GuestStaggerItem } from "../motion/guest-stagger";
import type { GuestServiceItem } from "../../types/guest-os-contract";

type GuestServiceCardProps = {
  service: GuestServiceItem;
  price: string;
  quantityLabel: string;
  quantityHint: string | null;
  actionLabel: string;
  onSelect: (service: GuestServiceItem) => void;
};

export function GuestServiceCard({ service, price, quantityLabel, quantityHint, actionLabel, onSelect }: GuestServiceCardProps) {
  return (
    <GuestStaggerItem className="h-full">
      <article className="group flex h-full flex-col rounded-[24px] border border-[#25483f]/10 bg-[#fffdfa] p-5 shadow-[0_12px_36px_rgba(31,61,53,0.08)] transition-[transform,box-shadow,border-color] duration-200 active:translate-y-px md:hover:-translate-y-1 md:hover:border-[#d7bd61]/70 md:hover:shadow-[0_20px_48px_rgba(31,61,53,0.13)]">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="vs-display text-xl font-semibold leading-7 text-[#18211d]">{service.name}</h3>
          {service.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5e6a62]">{service.description}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {quantityHint ? <span className="rounded-full bg-[#f4eedb] px-3 py-1.5 font-semibold text-[#745c00]">{quantityLabel}: {quantityHint}</span> : null}
            <span className="font-bold text-[#8a6a13]">{price}</span>
          </div>
        </div>
        <button type="button" onClick={() => onSelect(service)} className="vs-touch-button mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#25483f] px-5 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#19382f] active:bg-[#122b24]">
          {actionLabel}
        </button>
      </article>
    </GuestStaggerItem>
  );
}
