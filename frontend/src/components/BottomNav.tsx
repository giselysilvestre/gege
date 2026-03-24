"use client";

import { usePathname } from "next/navigation";
import { Home, Briefcase, Users, Database, Globe } from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: Home, label: "Início" },
  { path: "/vagas", icon: Briefcase, label: "Vagas" },
  { path: "/candidatos", icon: Users, label: "Candidatos" },
  { path: "/banco", icon: Database, label: "Banco" },
  { path: "/carreira", icon: Globe, label: "Carreira" },
];

/**
 * Navegação com <a href> (reload completo) em vez de next/link.
 * Evita transição RSC “pendurada” (barra verde que não termina) no dev /
 * browser embutido, onde o client router às vezes não recebe o flight.
 */
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav
      aria-label="Navegação principal"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        marginLeft: "auto",
        marginRight: "auto",
        width: "100%",
        maxWidth: "390px",
        minHeight: "64px",
        paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))",
        paddingTop: "10px",
        paddingLeft: "16px",
        paddingRight: "16px",
        backgroundColor: "#101828",
        borderTopLeftRadius: "24px",
        borderTopRightRadius: "24px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        zIndex: 9999,
        pointerEvents: "auto",
        touchAction: "manipulation",
        boxSizing: "border-box",
      }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <a
            key={item.path}
            href={item.path}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px 6px",
              minHeight: "44px",
              borderRadius: "20px",
              textDecoration: "none",
              WebkitTapHighlightColor: "transparent",
              cursor: "pointer",
              backgroundColor: active ? "#FFFFFF" : "transparent",
              transition: "background 0.15s",
              pointerEvents: "auto",
              position: "relative",
              zIndex: 1,
              color: "inherit",
            }}
          >
            <Icon size={18} color={active ? "#101828" : "rgba(255,255,255,0.55)"} style={{ flexShrink: 0, pointerEvents: "none" }} />
            {active ? (
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#101828", whiteSpace: "nowrap", pointerEvents: "none" }}>
                {item.label}
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}
