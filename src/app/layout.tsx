import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Records and Access Slice — Assessment 4",
  description:
    "Strict ownership invariant, opaque public identifiers, deletion audits, and zero cross-tenant leakage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <div className="brand-title">
            <span>SecureVault</span>
            <span className="brand-badge">Slice 4</span>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Records & Access Control Architecture
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
