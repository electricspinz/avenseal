import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.avenseal.com"),
  title: {
    default: "Avenseal | Remote Online Notary Appointments",
    template: "%s | Avenseal"
  },
  description: "Request a Florida remote online notary appointment with clear preparation, secure payment checkout, and a provider-hosted online session.",
  openGraph: {
    type: "website",
    siteName: "Avenseal",
    title: "Avenseal | Remote Online Notary Appointments",
    description: "Request a Florida remote online notary appointment with clear preparation and a provider-hosted online session.",
    url: "/"
  },
  twitter: {
    card: "summary",
    title: "Avenseal | Remote Online Notary Appointments",
    description: "Request a Florida remote online notary appointment with clear preparation and a provider-hosted online session."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
