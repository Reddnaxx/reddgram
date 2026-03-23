<script setup lang="ts">
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { formatPeerTitle } from '@/shared/lib/user-display'
import type { ChatListItem, MessageDto } from '@/stores/messenger'
import { useAuthStore } from '@/stores/auth'
import { useMessengerStore } from '@/stores/messenger'
import { Send } from 'lucide-vue-next'
import type { Socket } from 'socket.io-client'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

interface Row {
  id: string
  text: string
  outgoing: boolean
  createdAt: number
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
    text: dto.content,
    outgoing: dto.senderId === auth.user?.id,
    createdAt: new Date(dto.createdAt).getTime(),
  }
}

function onNewMessage(dto: MessageDto) {
  if (dto.chatId !== chatId.value) return
  if (messages.value.some((m) => m.id === dto.id)) return
  messages.value.push(dtoToRow(dto))
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
  } catch {
    loadError.value = 'Не удалось загрузить сообщения'
  }
}

watch(chatId, () => {
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
  const s = messenger.ensureSocket()
  socketBound = s
  s?.on('newMessage', onNewMessage)
  void loadHistory()
  void joinCurrentChat()
})

onBeforeUnmount(() => {
  socketBound?.off('newMessage', onNewMessage)
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
  draft.value = ''
  s.emit(
    'sendMessage',
    { chatId: id, content: text },
    (res: { ok?: boolean } | undefined) => {
      if (res && 'ok' in res && !res.ok) {
        loadError.value = 'Не удалось отправить'
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
  <div class="flex min-h-0 flex-1 flex-col">
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

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
        class="flex flex-col gap-2"
      >
        <li
          v-for="m in messages"
          :key="m.id"
          :class="m.outgoing ? 'flex justify-end' : 'flex justify-start'"
        >
          <span
            :class="
              m.outgoing
                ? 'bg-primary text-primary-foreground max-w-[min(100%,28rem)] rounded-2xl rounded-br-md px-3 py-2 text-sm'
                : 'bg-muted text-foreground max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md px-3 py-2 text-sm'
            "
          >
            {{ m.text }}
          </span>
        </li>
      </ul>
      <div
        ref="listEndRef"
        class="h-px shrink-0"
        aria-hidden="true"
      />
    </div>

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
