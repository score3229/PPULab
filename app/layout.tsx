import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://ppulab.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PS3 PPU Lab",
    template: "PS3 PPU Lab · %s",
  },
  description:
    "PS3 PPU Lab is a free web-based PowerPC (PPC) assembler, editor, and disassembler for PS3 PPU development. Assemble, patch, and export code for RPCS3 and NetCheat PS3. Inspired by CodeWizardPS3.",
  keywords: [
    "PS3 PPU Lab",
    "PS3 PPU assembler",
    "PowerPC assembler",
    "PPC assembler",
    "PS3 PowerPC",
    "Cell PPU",
    "CodeWizardPS3",
    "PS3 homebrew",
    "RPCS3 patch",
    "NetCheat PS3",
    "PS3 code compiler",
    "PS3 disassembler",
    "ppu-lab",
  ],
  applicationName: "PS3 PPU Lab",
  authors: [{ name: "CodeWizardPS3" }],
  creator: "CodeWizardPS3",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "PS3 PPU Lab",
    description:
      "Interactive PowerPC assembler & editor for PS3 PPU development. Assemble, patch, and export code for RPCS3 and NetCheat PS3.",
    siteName: "PS3 PPU Lab",
    locale: "en_US",
    images: [
      {
        url: "/images/ppu-lab-og.png",
        width: 1200,
        height: 630,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PS3 PPU Lab",
    description:
      "Interactive PowerPC assembler & editor for PS3 PPU development.",
    images: ["/images/ppu-lab-og.png"],
  },
  icons: {
    icon: { url: "/images/ppu-lab.png", type: "image/png" },
  },
};

// structured data so google understands this is a free web-based dev tool
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PS3 PPU Lab",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any (web-based)",
  browserRequirements: "Requires a modern browser with JavaScript.",
  description:
    "A free web-based PowerPC (PPC) assembler, editor, and disassembler for PS3 PPU development. Assemble, patch, and export code for RPCS3 and NetCheat PS3. Inspired by CodeWizardPS3.",
  inLanguage: "en",
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  keywords:
    "PS3 PPU, PowerPC assembler, PPC assembler, Cell PPU, CodeWizardPS3, RPCS3, NetCheat PS3, PS3 homebrew",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* a reopened / back-forward tab restores stale, reload for a clean mount */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var n=performance.getEntriesByType('navigation')[0];if(n&&n.type==='back_forward'){location.reload();return;}}catch(e){}addEventListener('pageshow',function(e){if(e.persisted)location.reload();});})();",
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
