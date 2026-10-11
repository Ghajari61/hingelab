import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/site/config";
import { THEME_BOOT_SCRIPT } from "@/lib/studio/themeBoot";
import "@/styles/tokens.css";
import "./globals.css";
import "./site.css";
import "@/components/shell/shell.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["laser cut generator", "living hinge box", "finger joint box", "cake topper SVG", "acrylic sign", "table numbers", "laser trophy", "key holder", "LightBurn", "xTool", "SVG generator", "laser cutter"],
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

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,600..800&family=Inter:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
