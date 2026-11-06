import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Fuerza HTML/RSC sin caché en el navegador/proxy tras cada deploy.
 * Los chunks hasheados en /_next/static se dejan pasar (caché largo correcto).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|mjs|css|map)$/i)
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, max-age=0, must-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: [
    /*
     * Excluye estáticos hasheados y archivos públicos típicos.
     * Con basePath, Next antepone el prefijo automáticamente.
     */
    "/((?!_next/static|_next/image|favicon.ico|img/|fonts/|pdfjs/).*)",
  ],
};
