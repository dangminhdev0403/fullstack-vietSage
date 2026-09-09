import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import Script from "next/script";
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
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: ["/icon.png"],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
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
      <head>
        <script
          id="in-app-webview-guard"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.zaloJSV2 = window.zaloJSV2 || {};
                var origOnError = window.onerror;
                window.onerror = function(msg, url, line, col, error) {
                  if (typeof msg === 'string' && (msg.indexOf('zaloJSV2') !== -1 || msg.indexOf('zalo') !== -1)) {
                    return true;
                  }
                  if (origOnError) return origOnError.apply(this, arguments);
                  return false;
                };
                window.addEventListener('error', function(e) {
                  var m = e && (e.message || (e.error && e.error.message)) || '';
                  if (typeof m === 'string' && (m.indexOf('zaloJSV2') !== -1 || m.indexOf('zalo') !== -1)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
              }
            `,
          }}
        />
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-S5153HRYYD"
          strategy="afterInteractive"
        />
        <Script id="vietsage-google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-S5153HRYYD');
          `}
        </Script>
      </head>
      <body className="min-h-full">
        <ReactQueryProvider>{children}</ReactQueryProvider>
        <AppToaster />
      </body>
    </html>
  );
}
