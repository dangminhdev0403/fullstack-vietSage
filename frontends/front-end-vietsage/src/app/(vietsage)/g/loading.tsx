import { RouteLoadingState } from "../_components/route-boundary-state";

export default function GuestLoading() {
  return <RouteLoadingState label="Loading guest experience" tone="guest" />;
}
