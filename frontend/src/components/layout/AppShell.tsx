'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const segments = pathname.split('/').filter(Boolean)
  const firstSegment = segments[0] ?? ''
  const secondSegment = segments[1] ?? ''

  const knownPrivateRoots = new Set([
    'dashboard',
    'vagas',
    'candidatos',
    'banco',
    'configuracoes',
    'carreira',
  ])

  const isPrivateRoute = knownPrivateRoots.has(secondSegment)
  const isPublicCarreiraSlug = firstSegment === 'carreira' && segments.length >= 2

  const hideShell =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    (!isPrivateRoute && !isPublicCarreiraSlug) ||
    isPublicCarreiraSlug
  const carreiraOnly = false

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
