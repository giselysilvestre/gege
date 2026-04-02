'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const knownPrivateRoots = new Set([
    'dashboard',
    'vagas',
    'candidatos',
    'banco',
    'configuracoes',
    'carreira',
  ])
  const firstSegment = pathname.split('/').filter(Boolean)[0] ?? ''
  const isPublicTopSlug = Boolean(firstSegment) && !knownPrivateRoots.has(firstSegment) && firstSegment !== 'login'
  const isPublicCarreiraSlug = pathname.startsWith('/carreira/') && pathname.split('/').filter(Boolean).length >= 2
  const hideShell =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    isPublicTopSlug ||
    isPublicCarreiraSlug
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
