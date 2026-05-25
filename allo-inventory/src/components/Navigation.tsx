// src/components/Navigation.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package2, LayoutDashboard, Warehouse } from "lucide-react";

export default function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Products", icon: Package2 },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/warehouses", label: "Warehouses", icon: Warehouse },
  ];

  return (
    <header
      style={{
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div
            style={{
              width: 32,
              height: 32,
              background: "var(--accent-amber)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                fontSize: 14,
                color: "#0d0f12",
              }}
            >
              A
            </span>
          </div>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              Allo Inventory
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
              }}
            >
              RESERVATION SYSTEM
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  color: active ? "var(--accent-amber)" : "var(--text-secondary)",
                  background: active ? "rgba(245, 158, 11, 0.08)" : "transparent",
                  border: active ? "1px solid rgba(245, 158, 11, 0.2)" : "1px solid transparent",
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
