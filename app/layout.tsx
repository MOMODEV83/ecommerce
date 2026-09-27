import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://skygardenaccess.com"),
  icons: {
    icon: [
      { url: "/images/cropped-Design-sans-titre-32x32.2a5f6.png", sizes: "32x32" },
      { url: "/images/cropped-Design-sans-titre-192x192.2a5f6.png", sizes: "192x192" },
    ],
    apple: "/images/cropped-Design-sans-titre-180x180.2a5f6.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-FR" suppressHydrationWarning>
      {/* The legacy page sets its own body classes before hydration. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
