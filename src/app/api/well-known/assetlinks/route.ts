/**
 * Digital Asset Links for the Android TWA — served at `/.well-known/assetlinks.json`
 * via a rewrite in next.config.ts.
 *
 * Why a route and not a static file: Next.js does NOT serve dot-directories from
 * `public/`, so `public/.well-known/assetlinks.json` silently 404s. Google's verifier
 * requires this exact path, over HTTPS, with `content-type: application/json` and no
 * redirects — which this satisfies.
 *
 * Values come from Bubblewrap's generated `twa-manifest.json` / `assetlinks.json`.
 * They are public (not secrets), so they are inlined as defaults and the app needs no
 * extra Vercel env config to verify. Override via env only if the signing key changes
 * — e.g. Play App Signing, where you must list BOTH the upload key and the Play key:
 *   ANDROID_PACKAGE_NAME
 *   ANDROID_SHA256_FINGERPRINTS  (comma-separated)
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Bubblewrap `twa-manifest.json` → packageId */
const DEFAULT_PACKAGE_NAME = "trade.raptorx.twa";

/**
 * SHA-256 of the signing cert (from Bubblewrap's generated android/assetlinks.json).
 * If you re-sign / rotate keys, or Google Play App Signing gives you a different
 * key, add every valid fingerprint here (or via ANDROID_SHA256_FINGERPRINTS).
 */
const DEFAULT_FINGERPRINTS = [
  "A3:2F:93:16:B5:07:E8:CD:E7:B4:A5:55:3F:0B:8F:92:F2:40:99:F2:5D:1B:AF:29:2A:E6:04:B5:07:EA:8F:95",
];

export async function GET() {
  const packageName =
    process.env.ANDROID_PACKAGE_NAME?.trim() || DEFAULT_PACKAGE_NAME;

  const envFingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fingerprints = envFingerprints.length
    ? envFingerprints
    : DEFAULT_FINGERPRINTS;

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      // Google's verifier requires application/json.
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
}
