import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { AppToaster } from "./_components/app-toaster";
import { ReactQueryProvider } from "./_components/react-query-provider";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "vietnamese"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "vietnamese"],
  axes: ["SOFT", "WONK", "opsz"],
});
export const metadata: Metadata = {
  metadataBase: new URL("https://vietsage.ai"),
  title: {
    default: "VietSage | Hospitality Operating System",
    template: "%s | VietSage",
  },
  description:
    "Modern hospitality operating system for hotels, guest experiences, room operations, service management, and business administration.",
  openGraph: {
    title: "VietSage Hospitality Operating System",
    description:
      "An integrated platform for hotel operations, GuestOS, room QR, service requests, staff workflows, and hospitality management.",
    type: "website",
    images: ["/marketing/bay.jpg"],
  },
  icons: {
    icon: [{ url: "/brand/vietsage-icon.png", type: "image/png" }],
    shortcut: ["/brand/vietsage-icon.png"],
    apple: [{ url: "/brand/vietsage-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ReactQueryProvider>{children}</ReactQueryProvider>
        <AppToaster />
      </body>
    </html>
  );
}
