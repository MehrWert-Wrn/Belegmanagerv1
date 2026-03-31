import type { Metadata } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Belegmanager",
  description: "Buchhaltungsvorbereitung für österreichische KMUs",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="de" className={jakartaSans.variable}>
      <body className="antialiased font-sans" {...(nonce ? { nonce } : {})}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
