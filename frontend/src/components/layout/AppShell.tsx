'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const hideShell = pathname === '/login' || pathname.startsWith('/login/')
  const carreiraOnly = pathname === '/carreira' || pathname.startsWith('/carreira/')

  if (hideShell) return <>{children}</>

  return (
    <>
      <Sidebar />
      <Topbar />
      <main
        className="app-shell-main"
        style={{
          marginLeft: 'var(--sidebar-w)',
          paddingTop: 'calc(var(--topbar-h) + 24px)',
          paddingLeft: carreiraOnly ? 0 : 28,
          paddingRight: carreiraOnly ? 0 : 28,
          paddingBottom: 24,
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </main>
      <MobileBottomNav />
    </>
  )
}
