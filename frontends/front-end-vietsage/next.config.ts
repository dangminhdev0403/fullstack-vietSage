import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? true : false,
  },
  allowedDevOrigins: [
    "*.devtunnels.ms",
    "*.ngrok.io",
    "*.ngrok-free.app",
    "desktop-j0ed8uv.taile58050.ts.net",
    "localhost",
    "127.0.0.1",
  ],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/socket.io/:path*",
        destination: "http://localhost:8080/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
