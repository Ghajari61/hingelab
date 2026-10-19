import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/site/config";
import { THEME_BOOT_SCRIPT } from "@/lib/studio/themeBoot";
import "@/styles/fonts";
import "@/styles/tokens.css";
import "./globals.css";
import "./site.css";
import "@/components/shell/shell.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["laser cut generator", "living hinge box", "finger joint box", "cake topper SVG", "acrylic sign", "table numbers", "laser trophy", "key holder", "3D paper cut shadow box SVG", "LightBurn", "xTool", "SVG generator", "laser cutter"],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "HingeLab: laser-cut generators for boxes, toppers, signs and more",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "HingeLab: laser-cut generators for boxes, toppers, signs and more", description: SITE_DESCRIPTION },
};

/** The headings' display face, preloaded (the landing page's largest text is set in it). */
const archivo = localFont({
  src: "../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  preload: true,
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  fallback: ["Inter Variable", "system-ui", "sans-serif"],
});

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={archivo.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
