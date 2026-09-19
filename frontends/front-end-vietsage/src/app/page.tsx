import { LaunchHold } from "@/app/_components/launch-hold";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VietSage | Nền tảng quản trị khách sạn và thương mại thông minh",
  description: "VietSage cung cấp giải pháp vận hành thông minh và trợ lý số cho khách sạn, nhà hàng và thương mại.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Home() {
  return <LaunchHold />;
}
