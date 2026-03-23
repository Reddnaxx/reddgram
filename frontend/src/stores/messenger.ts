import { apiFetch } from '@/shared/api/client'
import { getStoredToken } from '@/shared/lib/auth-token'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { io, type Socket } from 'socket.io-client'

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
}

export type MessageDto = {
  id: string
  chatId: string
  senderId: string
  content: string
  createdAt: string
}

export const useMessengerStore = defineStore('messenger', () => {
  const socket = shallowRef<Socket | null>(null)
  const chats = ref<ChatListItem[]>([])

  function disconnectSocket() {
    socket.value?.disconnect()
    socket.value = null
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
    })
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
    const updated: ChatListItem = {
      ...row,
      lastMessage: {
        content: dto.content,
        createdAt: dto.createdAt,
      },
    }
    chats.value = [
      updated,
      ...chats.value.filter((c) => c.id !== dto.chatId),
    ]
  }

  async function loadChats() {
    const res = await apiFetch('/chats')
    chats.value = (await res.json()) as ChatListItem[]
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
    disconnectSocket,
    ensureSocket,
    loadChats,
    applyMessageToChatList,
    searchUsers,
    createChat,
    fetchMessages,
  }
})
