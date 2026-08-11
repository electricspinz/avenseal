import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/google-analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avenseal | Remote Online Notary Appointments",
  description: "Book a same-day appointment with a commissioned Florida remote online notary.",
  metadataBase: new URL("https://www.avenseal.com"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Avenseal",
    title: "Avenseal | Remote Online Notary Appointments",
    description: "Book a same-day appointment with a commissioned Florida remote online notary."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        {children}
      </body>
    </html>
  );
}
