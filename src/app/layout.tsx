import type { Metadata } from "next";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

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
    <html lang="de">
      <body className="antialiased" {...(nonce ? { nonce } : {})}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
