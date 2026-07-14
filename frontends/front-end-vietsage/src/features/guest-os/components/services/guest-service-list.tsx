import type { GuestServiceItem } from "../../types/guest-os-contract";
import { GuestStagger } from "../motion/guest-stagger";
import { GuestServiceCard } from "./guest-service-card";

type GuestServiceListProps = {
  services: GuestServiceItem[];
  getPrice: (service: GuestServiceItem) => string;
  getQuantityHint: (service: GuestServiceItem) => string | null;
  quantityLabel: string;
  actionLabel: string;
  onSelect: (service: GuestServiceItem) => void;
};

export function GuestServiceList(props: GuestServiceListProps) {
  return (
    <GuestStagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {props.services.map((service) => (
        <GuestServiceCard key={service.id} service={service} price={props.getPrice(service)} quantityLabel={props.quantityLabel} quantityHint={props.getQuantityHint(service)} actionLabel={props.actionLabel} onSelect={props.onSelect} />
      ))}
    </GuestStagger>
  );
}
