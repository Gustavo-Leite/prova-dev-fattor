import type { Metadata } from "next";
import { Geist_Mono, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CNAB 444 Status Checker",
  description: "Upload a CNAB 444 remittance file and check the status of each invoice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
          {"Technical assessment project — not an official Fattor Crédito product."}
        </footer>
      </body>
    </html>
  );
}
