"use client";

import type { ReactNode } from "react";
import type { CrmViewId } from "@/lib/crm/types";

type IconProps = { className?: string };

function IconDashboard({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconColumns({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3v18M15 3v18M5 3h4M5 21h4M15 3h4M15 21h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconMessage({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 8h10M7 12h6M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBell({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4a4 4 0 0 1 4 4v2.2c0 .5.2 1 .5 1.4L18 14H6l1.5-2.4c.3-.4.5-.9.5-1.4V8a4 4 0 0 1 4-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M10 17a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkles({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.2 4.2L17.5 8.5 13.2 9.7 12 14l-1.2-4.3L6.5 8.5l4.3-1.3L12 3Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M18 14l.8 2.8L21.5 18l-2.7.8L18 21.5l-.8-2.7L14.5 18l2.7-.8L18 14Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

const NAV: {
  id: CrmViewId;
  label: string;
  Icon: (props: IconProps) => ReactNode;
}[] = [
  { id: "funil", label: "Visão Geral", Icon: IconDashboard },
  { id: "kanban", label: "Pipelines", Icon: IconColumns },
  { id: "conversas", label: "Conversas", Icon: IconMessage },
  { id: "alertas", label: "Alertas", Icon: IconBell },
];

type CrmSidebarProps = {
  view: CrmViewId;
  onNavigate: (view: CrmViewId) => void;
  alertasCount: number;
};

export default function CrmSidebar({
  view,
  onNavigate,
  alertasCount,
}: CrmSidebarProps) {
  return (
    <aside className="crm-sidebar">
      <div className="crm-sidebar-brand">
        <span className="crm-sidebar-logo" aria-hidden="true">
          <IconSparkles className="crm-sidebar-logo-svg" />
        </span>
        <div>
          <div className="crm-sidebar-title">Gegê</div>
          <div className="crm-sidebar-subtitle">CRM WhatsApp</div>
        </div>
      </div>

      <nav className="crm-sidebar-nav" aria-label="Navegação principal">
        <div className="crm-nav-section">Principal</div>
        {NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          const badge = id === "alertas" && alertasCount > 0 ? alertasCount : null;
          return (
            <button
              key={id}
              type="button"
              className={`crm-nav-item${active ? " active" : ""}`}
              onClick={() => onNavigate(id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="crm-nav-icon" />
              <span className="crm-nav-label">{label}</span>
              {badge != null && <span className="crm-nav-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
