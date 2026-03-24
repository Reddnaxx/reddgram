<script setup lang="ts">
import { formatPeerTitle } from '@/shared/lib/user-display';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { useAuthStore } from '@/stores/auth';
import type { ChatListItem, MessageDto } from '@/stores/messenger';
import { useMessengerStore } from '@/stores/messenger';
import { Check, CheckCheck, Loader2, Send, X } from 'lucide-vue-next';
import type { Socket } from 'socket.io-client';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

interface Row {
  id: string
  senderId: string
  text: string
  createdAt: number
  deliveredAt: string | null
  readAt: string | null
  pendingAck: boolean
  sendError: boolean
}

function isOutgoing(m: Row): boolean {
  const uid = auth.user?.id
  return !!uid && m.senderId === uid
}

const route = useRoute()
const auth = useAuthStore()
const messenger = useMessengerStore()

const chatId = computed(() => route.params.chatId as string)

const peerRow = computed(() => {
  const list = messenger.chats as ChatListItem[]
  return list.find((c: ChatListItem) => c.id === chatId.value) ?? null
})

const peerTitle = computed(() => {
  const p = peerRow.value?.peer
  if (!p) return null
  return formatPeerTitle(p)
})

const messages = ref<Row[]>([])
const draft = ref('')
const listEndRef = ref<HTMLElement | null>(null)
const loadError = ref<string | null>(null)
let socketBound: Socket | null = null

function dtoToRow(dto: MessageDto): Row {
  return {
    id: dto.id,
    senderId: dto.senderId,
    text: dto.content,
    createdAt: new Date(dto.createdAt).getTime(),
    deliveredAt: dto.deliveredAt ?? null,
    readAt: dto.readAt ?? null,
    pendingAck: false,
    sendError: false,
  }
}

function maybeMarkRead() {
  const s = messenger.ensureSocket()
  const cid = chatId.value
  if (!s?.connected || !cid) return
  let lastIncoming: Row | undefined
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]!
    if (!isOutgoing(m) && !m.id.startsWith('temp-')) {
      lastIncoming = m
      break
    }
  }
  if (!lastIncoming) return
  s.emit('markRead', { chatId: cid, messageId: lastIncoming.id })
  messenger.clearChatUnread(cid)
}

function onNewMessage(dto: MessageDto) {
  if (dto.chatId !== chatId.value) return
  const s = messenger.ensureSocket()
  const myId = auth.user?.id
  const isIncoming = !!(myId && dto.senderId !== myId)

  if (isIncoming) {
    s?.emit('ackDelivered', { chatId: dto.chatId, messageId: dto.id })
  }

  const existing = messages.value.find((m) => m.id === dto.id)
  if (existing) {
    existing.text = dto.content
    existing.deliveredAt = dto.deliveredAt ?? null
    existing.readAt = dto.readAt ?? null
    existing.pendingAck = false
    existing.sendError = false
    return
  }

  /** newMessage часто приходит раньше ack: сливаем с оптимистичной строкой, иначе будет дубль. */
  if (myId && dto.senderId === myId) {
    const tempIdx = messages.value.findIndex(
      (m) =>
        isOutgoing(m) &&
        m.pendingAck &&
        m.id.startsWith('temp-') &&
        m.text === dto.content,
    )
    if (tempIdx !== -1) {
      messages.value[tempIdx] = dtoToRow(dto)
      return
    }
  }

  messages.value.push(dtoToRow(dto))

  if (isIncoming) {
    void nextTick(() => maybeMarkRead())
  }
}

function onMessageStatus(payload: { updates: MessageDto[] }) {
  for (const u of payload.updates) {
    if (u.chatId !== chatId.value) continue
    const row = messages.value.find((m) => m.id === u.id)
    if (row) {
      row.deliveredAt = u.deliveredAt ?? null
      row.readAt = u.readAt ?? null
    }
  }
}

function outgoingStatusAriaLabel(m: Row): string {
  if (m.sendError) return 'Ошибка отправки'
  if (m.pendingAck) return 'Отправляется'
  if (m.readAt) return 'Прочитано'
  if (m.deliveredAt) return 'Доставлено'
  return 'Отправлено, ожидает доставки'
}

function outgoingStatusIcon(m: Row) {
  if (m.sendError) return X
  if (m.pendingAck) return Loader2
  if (m.readAt) return CheckCheck
  if (m.deliveredAt) return CheckCheck
  return Check
}

/** Цвета для фона страницы (не пузыря): primary-foreground там не виден на светлой теме. */
function outgoingStatusIconClass(m: Row): string {
  if (m.sendError) return 'text-destructive'
  if (m.pendingAck) return 'text-muted-foreground animate-spin'
  if (m.readAt) return 'text-primary'
  if (m.deliveredAt) return 'text-muted-foreground'
  return 'text-muted-foreground'
}

async function loadHistory() {
  loadError.value = null
  messages.value = []
  if (!chatId.value) return
  try {
    const { messages: list } = await messenger.fetchMessages(chatId.value)
    messages.value = list.map(dtoToRow)
    await nextTick()
    scrollListToEnd()
    maybeMarkRead()
  } catch {
    loadError.value = 'Не удалось загрузить сообщения'
  }
}

watch(chatId, (id) => {
  messenger.setFocusedChatId(id || null)
  void loadHistory()
  void joinCurrentChat()
})

async function joinCurrentChat() {
  const s = messenger.ensureSocket()
  if (!s || !chatId.value) return
  s.emit('joinChat', { chatId: chatId.value }, () => {
    /* ack optional */
  })
}

onMounted(() => {
  messenger.setFocusedChatId(chatId.value || null)
  const s = messenger.ensureSocket()
  socketBound = s
  s?.on('newMessage', onNewMessage)
  s?.on('messageStatus', onMessageStatus)
  void loadHistory()
  void joinCurrentChat()
})

onBeforeUnmount(() => {
  messenger.setFocusedChatId(null)
  socketBound?.off('newMessage', onNewMessage)
  socketBound?.off('messageStatus', onMessageStatus)
  socketBound = null
})

watch(
  () => messages.value.length,
  () => {
    void nextTick(() => scrollListToEnd())
  },
)

function scrollListToEnd() {
  listEndRef.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
}

function send() {
  const text = draft.value.trim()
  const id = chatId.value
  if (!text || !id) return
  const s = messenger.ensureSocket()
  if (!s?.connected) {
    loadError.value = 'Нет соединения с сервером'
    return
  }
  const tempId = `temp-${crypto.randomUUID()}`
  messages.value.push({
    id: tempId,
    senderId: auth.user?.id ?? '',
    text,
    createdAt: Date.now(),
    deliveredAt: null,
    readAt: null,
    pendingAck: true,
    sendError: false,
  })
  draft.value = ''
  void nextTick(() => scrollListToEnd())

  s.emit(
    'sendMessage',
    { chatId: id, content: text },
    (res: { ok?: boolean; message?: MessageDto } | undefined) => {
      if (!res?.ok || !res.message) {
        const idx = messages.value.findIndex((m) => m.id === tempId)
        if (idx !== -1) {
          const row = messages.value[idx]!
          row.sendError = true
          row.pendingAck = false
        }
        return
      }
      const real = res.message
      const tempIdx = messages.value.findIndex((m) => m.id === tempId)
      if (tempIdx !== -1) {
        messages.value[tempIdx] = dtoToRow(real)
        return
      }
      if (!messages.value.some((m) => m.id === real.id)) {
        messages.value.push(dtoToRow(real))
      }
    },
  )
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  e.preventDefault()
  send()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <header class="border-b px-4 py-3">
      <h1 class="text-base font-semibold">
        {{ peerTitle ?? 'Чат' }}
      </h1>
      <p
        v-if="!peerTitle && chatId"
        class="text-muted-foreground mt-0.5 truncate text-sm"
      >
        Загрузка…
      </p>
    </header>

    <ScrollArea class="min-h-0 flex-1 overflow-y-auto px-4 py-3" >
      <p
        v-if="loadError"
        class="text-destructive mb-2 text-sm"
        role="alert"
      >
        {{ loadError }}
      </p>
      <div
        v-if="messages.length === 0 && !loadError"
        class="text-muted-foreground text-sm"
      >
        Пока нет сообщений — напишите первым.
      </div>
      <ul
        v-else
        class="flex flex-col gap-3"
      >
        <li
          v-for="m in messages"
          :key="m.id"
          class="flex w-full min-w-0 shrink-0"
          :class="isOutgoing(m) ? 'justify-end' : 'justify-start'"
        >
          <div
            :class="
              isOutgoing(m)
                ? 'flex w-fit max-w-[min(100%,28rem)] min-w-0 flex-col items-end gap-0.5'
                : 'flex w-fit max-w-[min(100%,28rem)] min-w-0 flex-col items-start'
            "
          >
            <span
              :class="
                isOutgoing(m)
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2 text-sm'
                  : 'bg-muted text-foreground rounded-2xl rounded-bl-md px-3 py-2 text-sm'
              "
            >
              {{ m.text }}
            </span>
            <span
              v-if="isOutgoing(m)"
              class="flex min-h-[1.125rem] items-center justify-end gap-0.5 px-0.5 pt-0.5"
              :aria-label="outgoingStatusAriaLabel(m)"
              role="img"
            >
              <component
                :is="outgoingStatusIcon(m)"
                :class="['size-4 shrink-0 stroke-[2.25]', outgoingStatusIconClass(m)]"
                aria-hidden="true"
              />
            </span>
          </div>
        </li>
      </ul>
      <div
        ref="listEndRef"
        class="h-px shrink-0"
        aria-hidden="true"
      />
    </ScrollArea>

    <footer class="border-t p-3">
      <form
        class="flex gap-2"
        @submit.prevent="send"
      >
        <Input
          v-model="draft"
          type="text"
          placeholder="Сообщение…"
          class="min-w-0 flex-1"
          autocomplete="off"
          @keydown="onInputKeydown"
        />
        <Button
          type="submit"
          size="icon"
          :disabled="!draft.trim()"
          aria-label="Отправить"
        >
          <Send class="size-4" />
        </Button>
      </form>
    </footer>
  </div>
</template>
