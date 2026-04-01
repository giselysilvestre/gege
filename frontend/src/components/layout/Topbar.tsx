'use client'
import { usePathname, useRouter } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/dashboard': 'Início',
  '/vagas': 'Vagas',
  '/vagas/nova': 'Nova Vaga',
  '/candidatos': 'Candidatos',
  '/banco': 'Banco de Talentos',
  '/carreira': 'Página de Carreira',
  '/configuracoes': 'Configurações',
}

function getTitle(p: string) {
  if (TITLES[p]) return TITLES[p]
  const k = Object.keys(TITLES).sort((a,b) => b.length - a.length).find(k => p.startsWith(k + '/'))
  return k ? TITLES[k] : 'gegê'
}

export default function Topbar() {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  return (
    <header className="fixed top-0 right-0 z-40 flex items-center justify-between px-7 bg-white border-b"
      style={{ left: 'var(--sidebar-w)', height: 'var(--topbar-h)', borderColor: 'var(--n200)' }}>
      <span className="font-bold" style={{ color: 'var(--n900)', fontSize: 15 }}>{getTitle(pathname)}</span>
      <button onClick={() => router.push('/vagas/nova')}
        className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-full"
        style={{ background: 'var(--olive)' }}>
        + Nova Vaga
      </button>
    </header>
  )
}
