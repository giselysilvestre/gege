'use client'
import { createContext, useContext } from 'react'

const ClienteSlugContext = createContext<string>('')

export function ClienteSlugProvider({
  children,
  slug,
}: {
  children: React.ReactNode
  slug: string
}) {
  return (
    <ClienteSlugContext.Provider value={slug}>
      {children}
    </ClienteSlugContext.Provider>
  )
}

export function useClienteSlug() {
  return useContext(ClienteSlugContext)
}
