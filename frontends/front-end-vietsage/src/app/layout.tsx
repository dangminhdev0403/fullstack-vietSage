import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppToaster } from "./_components/app-toaster";
import { ReactQueryProvider } from "./_components/react-query-provider";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vietsage.ai"),
  title: {
    default: "VietSage | Hospitality Operating System",
    template: "%s | VietSage",
  },
  description:
    "Nền tảng công nghệ quản trị vận hành khách sạn thông minh, trải nghiệm khách lưu trú số hóa và quản lý buồng phòng hiện đại.",
  openGraph: {
    title: "VietSage Hospitality Operating System",
    description:
      "Hệ điều hành khách sạn thông minh tích hợp GuestOS, mã QR tại phòng, điều phối tác vụ và quản trị dịch vụ lưu trú.",
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
      className={`${beVietnamPro.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap"
          rel="stylesheet"
        />
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
