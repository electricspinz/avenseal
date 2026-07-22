import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avenseal | Remote Online Notary Appointments",
  description: "Book a same-day appointment with a commissioned Florida remote online notary."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
