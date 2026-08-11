import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/google-analytics";
import "./globals.css";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Avenseal",
  legalName: "Avenseal LLC",
  url: "https://www.avenseal.com",
  telephone: "+1-727-433-8565",
  email: "appointments@avenseal.com",
  description: "Avenseal coordinates Florida remote online notary appointment requests, payments, preparation, and customer-facing appointment access.",
  openingHours: "Mo-Fr 09:30-17:30"
};

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
    url: "/",
    images: [{ url: "/brand/avenseal-og-social.png", width: 1734, height: 907, alt: "Avenseal — Trust Every Signature." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avenseal | Remote Online Notary Appointments",
    description: "Request a Florida remote online notary appointment with clear preparation and a provider-hosted online session.",
    images: ["/brand/avenseal-og-social.png"]
  },
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(organizationSchema),
    }}
  />

  <GoogleAnalytics
    measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
  />

  {children}
</body>
    </html>
  );
}
