import { createContext, useContext, useMemo } from 'react'
import { MESSAGES, resolveMessages, type Messages } from '../headless/i18n/messages'

const MessagesContext = createContext<Messages | null>(null)

export const MessagesProvider = MessagesContext.Provider

export function useTraceMessages(): Messages {
  const fromContext = useContext(MessagesContext)
  const fallback = useMemo(() => resolveMessages(undefined), [])
  return fromContext ?? fallback
}

export function useResolvedMessages(locale?: string, overrides?: Partial<Messages>): Messages {
  const fromContext = useContext(MessagesContext)
  const navigatorMessages = useMemo(() => resolveMessages(undefined), [])

  return useMemo(() => {
    const base = locale === undefined ? (fromContext ?? navigatorMessages) : resolveMessages(locale)
    return overrides === undefined ? base : { ...base, ...overrides }
  }, [fromContext, navigatorMessages, locale, overrides])
}

export { MESSAGES }
