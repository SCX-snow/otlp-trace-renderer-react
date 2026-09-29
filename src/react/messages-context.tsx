import { createContext, useContext, useMemo } from 'react'
import { MESSAGES, resolveMessages, type Messages } from '../headless/i18n/messages'

/** null 表示「没有 Provider」，此时由 locale / navigator 现场解析 */
const MessagesContext = createContext<Messages | null>(null)

export const MessagesProvider = MessagesContext.Provider

/**
 * 拿当前语言的文案。自定义插槽（`renderSpanDetail` / `renderToolbar`）里用它，
 * 这样插槽内容也能跟着外层 locale / messages 走，不用自己再传一遍。
 */
export function useTraceMessages(): Messages {
  const fromContext = useContext(MessagesContext)
  const fallback = useMemo(() => resolveMessages(undefined), [])
  return fromContext ?? fallback
}

/**
 * 组件自己解析文案，优先级：`locale` prop > 上层 Provider > navigator.language，
 * 最后再叠 `overrides`。
 *
 * 组件因此既能挂在 TraceDetailView 里（Provider 已就绪），也能单独拎出来用
 * （传个 locale 就行，不必自己搭 Provider）。
 */
export function useResolvedMessages(locale?: string, overrides?: Partial<Messages>): Messages {
  const fromContext = useContext(MessagesContext)
  const navigatorMessages = useMemo(() => resolveMessages(undefined), [])

  return useMemo(() => {
    const base = locale === undefined ? (fromContext ?? navigatorMessages) : resolveMessages(locale)
    return overrides === undefined ? base : { ...base, ...overrides }
  }, [fromContext, navigatorMessages, locale, overrides])
}

export { MESSAGES }
