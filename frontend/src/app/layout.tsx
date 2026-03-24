import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gegê",
  description: "Recrutamento inteligente para food service",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div
          style={{
            maxWidth: "390px",
            margin: "0 auto",
            minHeight: "100vh",
            background: "#F9FAFB",
            position: "relative",
          }}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
