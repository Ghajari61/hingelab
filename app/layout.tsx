import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/site/config";
import "./globals.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["living hinge", "laser cut box", "kerf bending", "LightBurn", "SVG generator", "plywood box", "laser cutter"],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "HingeLab: living-hinge boxes, ready for your laser",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "HingeLab: living-hinge boxes, ready for your laser", description: SITE_DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#161616", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,600..800&family=Source+Sans+3:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
