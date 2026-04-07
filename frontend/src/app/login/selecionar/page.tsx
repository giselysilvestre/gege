'use client'
import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'

type Cliente = {
  id: string
  nome_empresa: string
  slug: string
}

function SelecionarClienteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [clientes, setClientes] = useState<Cliente[]>([])

  useEffect(() => {
    const raw = searchParams.get('clientes')
    if (!raw) { router.push('/login'); return }
    try {
      setClientes(JSON.parse(decodeURIComponent(raw)))
    } catch {
      router.push('/login')
    }
  }, [searchParams, router])

  return (
    <main className="login-shell">
      <Image
        src="/branding/logo-gege-wordmark-light.png"
        alt="gegê"
        width={280}
        height={84}
        priority
        className="login-logo-wordmark"
      />
      <div className="login-card">
        <h2>Selecionar empresa</h2>
        <p className="login-lead">Você tem acesso a mais de uma empresa. Escolha:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {clientes.map((c) => (
            <button
              key={c.id}
              className="login-submit"
              style={{ background: 'var(--berry)' }}
              onClick={() => window.location.assign(`/${c.slug}/dashboard`)}
            >
              {c.nome_empresa}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

export default function SelecionarClientePage() {
  return (
    <Suspense fallback={null}>
      <SelecionarClienteContent />
    </Suspense>
  )
}
