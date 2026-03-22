import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gegê — Candidatos",
  description: "Gestão simples de candidatos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
