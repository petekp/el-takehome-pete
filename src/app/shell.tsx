'use client'

import {
  Sidebar,
  SidebarChatItem,
  SidebarNav,
  SidebarNavItem,
  SidebarSection,
} from '@/components/chat'
import { useChatStore } from '@/lib/chat-store'
import { cn } from '@/lib/utils'
import { Folder, Plus } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useSyncExternalStore, type ReactNode } from 'react'

const COLLAPSED_KEY = 'education-labs:sidebar-collapsed'
const COLLAPSED_CHANGE_EVENT = 'education-labs:sidebar-collapsed-change'

function readCollapsedPreference() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(COLLAPSED_KEY) === '1'
}

function subscribeCollapsedPreference(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(COLLAPSED_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(COLLAPSED_CHANGE_EVENT, onChange)
  }
}

function toStableDomId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-')
}

// Routes that opt out of the AppShell chrome (sidebar, providers in the
// children). Useful for narration/recording surfaces where the chat shell
// would be a distraction.
const STANDALONE_ROUTE_PREFIXES = ['/evolution']

export function AppShell({ children }: { children: ReactNode }) {
  const { config, chats, deleteChat } = useChatStore()
  const pathname = usePathname()
  const { push } = useRouter()
  const collapsed = useSyncExternalStore(
    subscribeCollapsedPreference,
    readCollapsedPreference,
    () => false,
  )

  if (STANDALONE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return <>{children}</>
  }

  const toggleSidebar = () => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '0' : '1')
    window.dispatchEvent(new Event(COLLAPSED_CHANGE_EVENT))
  }

  const handleDelete = (chatId: string) => {
    deleteChat(chatId)
    if (pathname === `/chat/${chatId}`) push('/new')
  }

  return (
    <div className="flex h-dvh">
      <Sidebar userName={config.userName} collapsed={collapsed} onToggle={toggleSidebar}>
        <SidebarNav>
          <SidebarNavItem href="/new" icon={Plus} label="New chat" />
          <SidebarNavItem href="/projects" icon={Folder} label="Projects" />
        </SidebarNav>

        {chats.length > 0 && (
          <SidebarSection label="Recents">
            {chats.map((chat) => (
              <SidebarChatItem
                key={chat.id}
                href={`/chat/${chat.id}`}
                menuId={`sidebar-chat-${toStableDomId(chat.id)}`}
                onDelete={() => handleDelete(chat.id)}
              >
                {chat.title}
              </SidebarChatItem>
            ))}
          </SidebarSection>
        )}
      </Sidebar>

      <div
        className={cn(
          'relative flex h-dvh flex-1 flex-col transition-[margin] duration-200',
          collapsed ? 'ml-[var(--sidebar-width-collapsed)]' : 'ml-[var(--sidebar-width)]',
        )}
      >
        {children}
      </div>
    </div>
  )
}
