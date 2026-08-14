/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**", // Allows any hostname
        pathname: "/.*/**", // Allows any pathname
      },
      {
        protocol: "http",
        hostname: "**", // Allows any hostname
        pathname: "/.*/**", // Allows any pathname
      },
    ],
  },
  async rewrites() {
    return [
      // Next.js does not serve dot-directories from `public/`, so
      // `public/.well-known/assetlinks.json` would 404. Map the well-known path
      // (which Google's Digital Asset Links verifier requires verbatim) onto a
      // route handler that emits it with `content-type: application/json`.
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
    ];
  },
};

module.exports = nextConfig;
