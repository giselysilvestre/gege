/** Logs só em desenvolvimento (evita ruído e vazamento de contexto no browser em produção). */
export function devWarn(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") console.warn(...args);
}

export function devError(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") console.error(...args);
}
