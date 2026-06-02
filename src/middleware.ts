import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/solana", request.url));
  }
  if (pathname === "/screener" || pathname === "/rexscreener") {
    return NextResponse.redirect(new URL("/solana", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/screener", "/rexscreener"],
};
