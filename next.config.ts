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
};

module.exports = nextConfig;

// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   images: {
//     remotePatterns: [
//       {
//         protocol: "https",
//         hostname: "**", // Allows any hostname
//         pathname: "/.*/**", // Allows any pathname
//       },
//       {
//         protocol: "http",
//         hostname: "**", // Allows any hostname
//         pathname: "/.*/**", // Allows any pathname
//       },
//     ],
//   },
// };

// module.exports = nextConfig;
