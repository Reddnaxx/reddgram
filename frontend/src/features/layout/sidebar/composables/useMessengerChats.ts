import { formatPeerTitle } from '@/shared/lib/user-display'
import type { ChatListItem } from '@/stores/messenger'
import { useMessengerStore } from '@/stores/messenger'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import type { MessengerChatItem } from '../types'

function toMessengerItem(
  c: ChatListItem,
  peerOnline: Record<string, boolean>,
): MessengerChatItem {
  const peer = c.peer
  return {
    id: c.id,
    title: peer ? formatPeerTitle(peer) : 'Чат',
    subtitle: c.lastMessage?.content,
    unreadCount: c.unreadCount ?? 0,
    peerOnline: peer ? (peerOnline[peer.id] ?? false) : undefined,
  }
}

export function useMessengerChats() {
  const messenger = useMessengerStore()
  const { chats, peerOnline } = storeToRefs(messenger)

  const chatItems = computed(() =>
    chats.value.map((c) => toMessengerItem(c, peerOnline.value)),
  )

  return {
    chatItems,
    loadChats: () => messenger.loadChats(),
    ensureSocket: () => messenger.ensureSocket(),
  }
}
