import type { NextConfig } from "next";

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
  { key: "Pragma", value: "no-cache" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      { source: "/api/:path*", headers: noStoreHeaders },
      { source: "/hospital", headers: noStoreHeaders },
      { source: "/hospital/:path*", headers: noStoreHeaders },
      { source: "/super-admin", headers: noStoreHeaders },
      { source: "/super-admin/:path*", headers: noStoreHeaders },
      { source: "/pharmacy", headers: noStoreHeaders },
      { source: "/pharmacy/:path*", headers: noStoreHeaders },
      { source: "/doctor", headers: noStoreHeaders },
      { source: "/doctor/:path*", headers: noStoreHeaders },
      { source: "/laboratory", headers: noStoreHeaders },
      { source: "/laboratory/:path*", headers: noStoreHeaders },
      { source: "/print/:path*", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
