// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Allo Inventory — Reservation System",
  description: "Production-grade inventory reservation system for multi-warehouse retail",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <Navigation />
          <main className="flex-1">
            {children}
          </main>
        </div>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#181d27",
              border: "1px solid #2a3040",
              color: "#e8ecf4",
              fontFamily: "DM Sans, sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}
