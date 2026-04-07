'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function LoginClientePage() {
  const params = useParams()
  const clienteSlug = params?.clienteSlug as string
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    let redirecting = false
    try {
      const supabase = getSupabaseBrowserClient()
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      })
      if (signInError) throw signInError
      if (!authData?.session) throw new Error('Sessão não foi criada.')
      redirecting = true
      await new Promise((r) => setTimeout(r, 0))
      window.location.assign(`${window.location.origin}/${clienteSlug}/dashboard`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar')
    } finally {
      if (!redirecting) setLoading(false)
    }
  }

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
      <p className="login-tagline">monte sua equipe!</p>
      <form className="login-card" onSubmit={onSubmit} autoComplete="on" method="post">
        <h2>Entrar</h2>
        <p className="login-lead">Acesse com seu email</p>
        <div className="login-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="username"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="login-field" style={{ marginBottom: 8 }}>
          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            name="password"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="login-submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        {error ? <p className="login-error">{error}</p> : null}
      </form>
    </main>
  )
}
