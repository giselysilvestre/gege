'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { displayNameFromUser, initialsFromDisplayName } from '@/lib/displayNameFromUser'
import { getAuthUserWithFreshMetadata } from '@/lib/getAuthUserWithFreshMetadata'
import { getClienteBySlug } from '@/lib/getClienteBySlug'

const NAV = [
  { route: 'dashboard', label: 'Início', icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><path d="M2 8.5L9 2l7 6.5V16a1 1 0 01-1 1H3a1 1 0 01-1-1V8.5z"/><path d="M6 17v-6h6v6"/></svg> },
  { route: 'vagas', label: 'Vagas', icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><rect x="2" y="7" width="14" height="10" rx="1.5"/><path d="M12 7V5a3 3 0 00-6 0v2"/></svg> },
  { route: 'candidatos', label: 'Candidatos', icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><circle cx="9" cy="6" r="3.5"/><path d="M2 16c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg> },
  { route: 'banco', label: 'Banco de Talentos', icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><ellipse cx="9" cy="5" rx="6" ry="2.5"/><path d="M3 5v3c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5"/><path d="M3 8v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8"/></svg> },
  { route: 'carreira', label: 'Página de Carreira', icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><circle cx="9" cy="9" r="7"/><path d="M9 2c-2 2.5-2 11.5 0 14M9 2c2 2.5 2 11.5 0 14M2 9h14"/></svg> },
]

export default function Sidebar() {
  const pathname = usePathname() ?? ''
  const clienteSlug = pathname.split('/').filter(Boolean)[0] ?? ''
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement | null>(null)
  const [profilePerson, setProfilePerson] = useState('—')
  const [profileCompany, setProfileCompany] = useState('—')
  const [profileInitials, setProfileInitials] = useState('—')
  const isActive = (route: string) => {
    const base = `/${clienteSlug}/${route}`
    return pathname === base || pathname.startsWith(base + '/')
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sb = getSupabaseBrowserClient()
      const user = await getAuthUserWithFreshMetadata(sb)
      if (!user || cancelled) {
        if (!cancelled) {
          setProfilePerson('Recrutador')
          setProfileCompany('—')
          setProfileInitials('?')
        }
        return
      }
      const name = displayNameFromUser(user)
      setProfilePerson(name)
      setProfileInitials(initialsFromDisplayName(name))
      const cli = clienteSlug ? await getClienteBySlug(clienteSlug) : null
      if (cancelled) return
      setProfileCompany(cli?.nome_empresa?.trim() || '—')
    })()
    return () => {
      cancelled = true
    }
  }, [clienteSlug])

  useEffect(() => {
    if (!profileOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (!profileRef.current) return
      if (!profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [profileOpen])

  async function onLogout() {
    const sb = getSupabaseBrowserClient()
    await sb.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="app-sidebar fixed top-0 left-0 h-screen flex flex-col z-50" style={{ width: 'var(--sidebar-w)', background: 'var(--berry)' }}>
      <div className="px-5 py-5 border-b border-white/10">
        <Link
          href={`/${clienteSlug}/dashboard`}
          className="sb-logo-link block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--berry)]"
          aria-label="Ir para Início"
        >
          <Image
            src="/branding/logo-gege-wordmark-light.png"
            alt=""
            width={220}
            height={66}
            className="sb-logo-wordmark"
          />
        </Link>
      </div>
      <nav className="flex-1 px-2.5 py-3.5 overflow-y-auto">
        {NAV.map(({ route, label, icon }) => {
          const href = `/${clienteSlug}/${route}`
          const active = isActive(route)
          return (
            <button key={route} onClick={() => router.push(href)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-0.5 text-sm transition-all duration-150"
              style={{ color: active ? 'var(--olive-mid)' : 'var(--sidebar-icon-muted)', background: active ? 'var(--sidebar-active-bg)' : 'transparent', fontWeight: active ? 600 : 500 }}>
              {icon}
              <span className="flex-1 text-left truncate">{label}</span>
            </button>
          )
        })}
      </nav>
      <div className="px-2.5 py-3.5 border-t border-white/10">
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setProfileOpen((v) => !v)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'var(--sidebar-profile-bg)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--olive)', color: 'var(--berry)' }}>{profileInitials}</div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold text-white/90 truncate">{profilePerson}</div>
              <div className="text-xs text-white/40 truncate">{profileCompany}</div>
            </div>
          </button>
          {profileOpen ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '100%',
                marginBottom: 8,
                background: 'rgba(255,255,255,0.98)',
                borderRadius: 14,
                border: '1px solid rgba(200,141,184,0.35)',
                boxShadow: '0 12px 30px rgba(16,24,40,0.2)',
                overflow: 'hidden',
                backdropFilter: 'blur(6px)',
              }}
            >
              <button
                type="button"
                onClick={() => { setProfileOpen(false); router.push(`/${clienteSlug}/configuracoes`) }}
                className="w-full text-left px-3 py-2 text-sm"
                style={{ color: 'var(--berry-dark)', fontWeight: 600, background: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--berry-light)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Configurações
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full text-left px-3 py-2 text-sm"
                style={{ color: 'var(--berry)', borderTop: '1px solid rgba(200,141,184,0.28)', fontWeight: 600, background: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,45,91,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

