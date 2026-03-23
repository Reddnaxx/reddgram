import { formatPeerTitle } from '@/shared/lib/user-display'
import type { ChatListItem } from '@/stores/messenger'
import { useMessengerStore } from '@/stores/messenger'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import type { MessengerChatItem } from '../types'

function toMessengerItem(c: ChatListItem): MessengerChatItem {
  const peer = c.peer
  return {
    id: c.id,
    title: peer ? formatPeerTitle(peer) : 'Чат',
    subtitle: c.lastMessage?.content,
  }
}

export function useMessengerChats() {
  const messenger = useMessengerStore()
  const { chats } = storeToRefs(messenger)

  const chatItems = computed(() =>
    chats.value.map(toMessengerItem),
  )

  return {
    chatItems,
    loadChats: () => messenger.loadChats(),
    ensureSocket: () => messenger.ensureSocket(),
  }
}
