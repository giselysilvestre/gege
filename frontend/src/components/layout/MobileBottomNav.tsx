"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV = [
  {
    href: "/dashboard",
    label: "Início",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8.5L9 2l7 6.5V16a1 1 0 01-1 1H3a1 1 0 01-1-1V8.5z" />
        <path d="M6 17v-6h6v6" />
      </svg>
    ),
  },
  {
    href: "/vagas",
    label: "Vagas",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="14" height="10" rx="1.5" />
        <path d="M12 7V5a3 3 0 00-6 0v2" />
      </svg>
    ),
  },
  {
    href: "/candidatos",
    label: "Candidatos",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="6" r="3.5" />
        <path d="M2 16c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      </svg>
    ),
  },
  {
    href: "/banco",
    label: "Banco",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="9" cy="5" rx="6" ry="2.5" />
        <path d="M3 5v3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" />
        <path d="M3 8v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8" />
      </svg>
    ),
  },
  {
    href: "/carreira",
    label: "Carreira",
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="7" />
        <path d="M9 2c-2 2.5-2 11.5 0 14M9 2c2 2.5 2 11.5 0 14M2 9h14" />
      </svg>
    ),
  },
] as const;

export default function MobileBottomNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const hidden = pathname === "/login" || pathname.startsWith("/login/");
  if (hidden) return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <button
            key={item.href}
            type="button"
            className={`mobile-bottom-nav-item${active ? " is-active" : ""}`}
            onClick={() => router.push(item.href)}
            aria-current={active ? "page" : undefined}
          >
            <span className="mobile-bottom-nav-icon">{item.icon}</span>
            <span className="mobile-bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
