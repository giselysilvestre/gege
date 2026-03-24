"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, Users, User } from "lucide-react";

const items = [
  { icon: LayoutDashboard, label: "Inicio", href: "/dashboard" },
  { icon: Briefcase, label: "Vagas", href: "/vagas" },
  { icon: Users, label: "Candidatos", href: "/vagas" },
  { icon: User, label: "Perfil", href: "/perfil" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-bg">
      <div className="mx-auto flex max-w-[480px]">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 ${active ? "text-ink" : "text-[#BBBBBB]"}`}
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}