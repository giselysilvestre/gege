"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/visao-geral", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/conversas", label: "Inbox" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">Gege CRM</div>
      <div className="brand-sub">WhatsApp</div>
      <nav className="nav">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "active" : ""}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
