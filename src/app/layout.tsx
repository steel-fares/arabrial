import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "ARBR | المحفظة والتبادل",
  description: "منصة التبادل وإدارة المحفظة لـ Arab Rial (ARBR)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="lang-ar wallet-body">
        <div className="bg-layer"></div>
        <div className="bg-grid"></div>
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
