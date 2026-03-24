import { apiFetch } from '@/shared/api/client'
import { getStoredToken } from '@/shared/lib/auth-token'
import { playIncomingMessageSound } from '@/shared/lib/message-sound'
import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import { ref, shallowRef } from 'vue'
import { useAuthStore } from './auth'

export type ChatListItem = {
  id: string
  peer: {
    id: string
    phone: string
    username: string | null
    firstName: string | null
    lastName: string | null
  } | null
  lastMessage: { content: string; createdAt: string } | null
  unreadCount?: number
}

export type MessageAttachmentDto = {
  kind: 'image' | 'file'
  url: string
  mimeType: string
  fileName: string
}

export type MessageDto = {
  id: string
  chatId: string
  senderId: string
  content: string
  attachments: MessageAttachmentDto[] | null
  createdAt: string
  deliveredAt: string | null
  readAt: string | null
}

export function lastMessagePreviewFromDto(dto: MessageDto): string {
  const t = dto.content?.trim() ?? ''
  if (t) return t
  const a = dto.attachments
  if (!a?.length) return t
  if (a.length === 1) {
    const x = a[0]!
    return x.kind === 'image' ? 'Фото' : `Файл: ${x.fileName}`
  }
  return `Вложения (${a.length})`
}

export const useMessengerStore = defineStore('messenger', () => {
  const socket = shallowRef<Socket | null>(null)
  const chats = ref<ChatListItem[]>([])
  /** Чат, открытый на экране (для подавления звука в активном диалоге). */
  const focusedChatId = ref<string | null>(null)
  /** userId пиров в сети (последний снимок + инкрементальные peerPresence). */
  const lastOnlinePeerIds = ref<Set<string>>(new Set())
  /** Для UI: peer.id → онлайн (только для пиров из списка чатов). */
  const peerOnline = ref<Record<string, boolean>>({})

  function syncPeerOnlineFromSet() {
    const online = lastOnlinePeerIds.value
    const next: Record<string, boolean> = {}
    for (const c of chats.value) {
      const id = c.peer?.id
      if (id) next[id] = online.has(id)
    }
    peerOnline.value = next
  }

  function onPresenceSnapshot(payload: { onlineUserIds?: string[] }) {
    const ids = payload?.onlineUserIds
    if (!Array.isArray(ids)) return
    lastOnlinePeerIds.value = new Set(ids)
    syncPeerOnlineFromSet()
  }

  function onPeerPresence(payload: {
    userId?: string
    online?: boolean
  }) {
    const uid = payload?.userId
    if (typeof uid !== 'string') return
    const online = payload?.online === true
    const s = new Set(lastOnlinePeerIds.value)
    if (online) s.add(uid)
    else s.delete(uid)
    lastOnlinePeerIds.value = s
    syncPeerOnlineFromSet()
  }

  function setFocusedChatId(id: string | null) {
    focusedChatId.value = id
  }

  function disconnectSocket() {
    socket.value?.disconnect()
    socket.value = null
    lastOnlinePeerIds.value = new Set()
    peerOnline.value = {}
  }

  function ensureSocket() {
    const token = getStoredToken()
    if (!token) return null
    if (socket.value) {
      return socket.value
    }
    const s = io({
      path: '/socket.io',
      auth: { token },
    })
    s.on('newMessage', (dto: MessageDto) => {
      applyMessageToChatList(dto)
      const auth = useAuthStore()
      const myId = auth.user?.id
      if (!myId || dto.senderId === myId) return
      if (focusedChatId.value === dto.chatId) return
      playIncomingMessageSound()
    })
    s.on('presenceSnapshot', onPresenceSnapshot)
    s.on('peerPresence', onPeerPresence)
    socket.value = s
    return s
  }

  function applyMessageToChatList(dto: MessageDto) {
    const idx = chats.value.findIndex((c) => c.id === dto.chatId)
    if (idx === -1) {
      void loadChats()
      return
    }
    const row = chats.value[idx]!
    const auth = useAuthStore()
    const myId = auth.user?.id
    const isIncoming = !!(myId && dto.senderId !== myId)
    const bumpUnread =
      isIncoming && focusedChatId.value !== dto.chatId
    const prevUnread = row.unreadCount ?? 0
    const updated: ChatListItem = {
      ...row,
      lastMessage: {
        content: lastMessagePreviewFromDto(dto),
        createdAt: dto.createdAt,
      },
      unreadCount: bumpUnread ? prevUnread + 1 : prevUnread,
    }
    chats.value = [
      updated,
      ...chats.value.filter((c) => c.id !== dto.chatId),
    ]
  }

  function clearChatUnread(chatId: string) {
    const idx = chats.value.findIndex((c) => c.id === chatId)
    if (idx === -1) return
    const row = chats.value[idx]!
    if ((row.unreadCount ?? 0) === 0) return
    const updated: ChatListItem = { ...row, unreadCount: 0 }
    chats.value = [
      updated,
      ...chats.value.filter((c) => c.id !== chatId),
    ]
  }

  async function loadChats() {
    const res = await apiFetch('/chats')
    chats.value = (await res.json()) as ChatListItem[]
    syncPeerOnlineFromSet()
  }

  async function searchUsers(query: string) {
    const res = await apiFetch(
      `/users/search?q=${encodeURIComponent(query)}`,
    )
    return (await res.json()) as {
      id: string
      phone: string
      username: string | null
      firstName: string | null
      lastName: string | null
    }[]
  }

  async function createChat(peerUserId: string): Promise<string> {
    const res = await apiFetch('/chats', {
      method: 'POST',
      body: JSON.stringify({ peerUserId }),
    })
    const data = (await res.json()) as {
      id: string
      peer: {
        id: string
        phone: string
        username: string | null
        firstName: string | null
        lastName: string | null
      }
    }
    await loadChats()
    return data.id
  }

  async function fetchMessages(
    chatId: string,
    cursor?: string,
  ): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
    const q = cursor
      ? `?cursor=${encodeURIComponent(cursor)}`
      : ''
    const res = await apiFetch(`/chats/${chatId}/messages${q}`)
    return (await res.json()) as {
      messages: MessageDto[]
      nextCursor: string | null
    }
  }

  return {
    socket,
    chats,
    focusedChatId,
    peerOnline,
    setFocusedChatId,
    disconnectSocket,
    ensureSocket,
    loadChats,
    applyMessageToChatList,
    clearChatUnread,
    searchUsers,
    createChat,
    fetchMessages,
  }
})
