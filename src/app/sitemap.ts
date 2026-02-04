import type { MetadataRoute } from "next";

const getBaseUrl = (): string => {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL as string;
  }
  return "https://raptorx.trade";
};

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getBaseUrl().replace(/\/$/, "");
  const now = new Date();
  
  // Define routes with their priorities and change frequencies
  const routes = [
    {
      path: "/",
      priority: 1.0,
      changeFrequency: "daily" as const,
    },
    {
      path: "/coming-soon",
      priority: 0.3,
      changeFrequency: "monthly" as const,
    },
  ];

  return routes.map((route) => ({
    url: `${base}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}


