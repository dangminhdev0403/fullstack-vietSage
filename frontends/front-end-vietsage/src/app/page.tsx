import { LaunchHold } from "@/app/_components/launch-hold";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VietSage | VietSage is taking shape",
  description: "VietSage is preparing its next public experience.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Home() {
  return <LaunchHold />;
}
