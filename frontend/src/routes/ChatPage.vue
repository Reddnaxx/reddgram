<script setup lang="ts">
import { apiUpload } from '@/shared/api/client';
import { formatPeerTitle } from '@/shared/lib/user-display';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useAuthStore } from '@/stores/auth';
import type {
  ChatListItem,
  MessageAttachmentDto,
  MessageDto,
} from '@/stores/messenger';
import { useMessengerStore } from '@/stores/messenger';
import {
  Check,
  CheckCheck,
  File as FileIcon,
  Loader2,
  Paperclip,
  Send,
  X,
} from 'lucide-vue-next';
import type { Socket } from 'socket.io-client';
import { useDebounceFn } from '@vueuse/core';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  Teleport,
  watch,
  watchEffect,
} from 'vue';
import { useRoute } from 'vue-router';

interface Row {
  id: string
  senderId: string
  text: string
  attachments: MessageAttachmentDto[] | null
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

function attachmentsSortKey(
  list: MessageAttachmentDto[] | null | undefined,
): string | null {
  if (!list?.length) return null
  return [...list]
    .map((a) => `${a.fileName}:${a.mimeType}`)
    .sort()
    .join('|')
}

function runViewTransition(cb: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (fn: () => void) => { finished: Promise<void> }
  }
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(cb)
  } else {
    cb()
  }
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

const peerIsOnline = computed(() => {
  const id = peerRow.value?.peer?.id
  if (!id) return false
  return messenger.peerOnline[id] ?? false
})

const SCROLL_LOAD_OLDER_PX = 100
const STICK_TO_BOTTOM_PX = 80

const messages = ref<Row[]>([])
const draft = ref('')
const scrollViewportRef = ref<HTMLElement | null>(null)
/** Рост высоты контента внутри скролла (текст, картинки). */
const messagesScrollContentRef = ref<HTMLElement | null>(null)
const nextCursor = ref<string | null>(null)
const loadingOlder = ref(false)
/** После загрузки истории удерживаем низ при росте контента (картинки, layout). */
const pinHistoryToBottom = ref(false)
let pinHistoryClearTimer: ReturnType<typeof setTimeout> | null = null
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
/** Превью выбранных файлов до отправки (object URLs). */
const selectedPreviews = ref<
  { objectUrl: string; name: string; isImage: boolean }[]
>([])
const loadError = ref<string | null>(null)
const lightbox = ref<{ src: string; vtName: string } | null>(null)
let socketBound: Socket | null = null

function thumbVtName(messageId: string, index: number): string {
  return `chat-photo-${messageId}-${index}`
}

function composerPickVtName(index: number): string {
  return `composer-pick-${index}`
}

function isThumbVtSuppressed(name: string): boolean {
  return lightbox.value?.vtName === name
}

function openLightbox(src: string, vtName: string): void {
  runViewTransition(() => {
    lightbox.value = { src, vtName }
  })
}

function closeLightbox(): void {
  runViewTransition(() => {
    lightbox.value = null
  })
}

function onLightboxKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeLightbox()
  }
}

function dtoToRow(dto: MessageDto): Row {
  return {
    id: dto.id,
    senderId: dto.senderId,
    text: dto.content,
    attachments: dto.attachments ?? null,
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
    existing.attachments = dto.attachments ?? null
    existing.deliveredAt = dto.deliveredAt ?? null
    existing.readAt = dto.readAt ?? null
    existing.pendingAck = false
    existing.sendError = false
    return
  }

  if (myId && dto.senderId === myId) {
    const dtoKey = attachmentsSortKey(dto.attachments)
    const dtoText = dto.content?.trim() ?? ''
    const tempIdx = messages.value.findIndex(
      (m) =>
        isOutgoing(m) &&
        m.pendingAck &&
        m.id.startsWith('temp-') &&
        m.text === dtoText &&
        attachmentsSortKey(m.attachments) === dtoKey &&
        dtoKey !== null,
    )
    if (tempIdx !== -1) {
      const prev = messages.value[tempIdx]!
      for (const a of prev.attachments ?? []) {
        if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url)
      }
      messages.value[tempIdx] = dtoToRow(dto)
      return
    }
    const tempTextIdx = messages.value.findIndex(
      (m) =>
        isOutgoing(m) &&
        m.pendingAck &&
        m.id.startsWith('temp-') &&
        m.text === dto.content &&
        !attachmentsSortKey(m.attachments) &&
        !dto.attachments?.length,
    )
    if (tempTextIdx !== -1) {
      messages.value[tempTextIdx] = dtoToRow(dto)
      return
    }
  }

  messages.value.push(dtoToRow(dto))

  if (isIncoming) {
    void nextTick(() => {
      maybeMarkRead()
      if (isNearBottom()) {
        scrollListToEnd({ smooth: true })
      }
    })
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

function outgoingStatusIconClass(m: Row): string {
  if (m.sendError) return 'text-destructive'
  if (m.pendingAck) return 'text-muted-foreground animate-spin'
  if (m.readAt) return 'text-primary'
  if (m.deliveredAt) return 'text-muted-foreground'
  return 'text-muted-foreground'
}

function scrollViewportEl(): HTMLElement | null {
  return scrollViewportRef.value
}

function isNearBottom(): boolean {
  const el = scrollViewportEl()
  if (!el) return true
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  return gap <= STICK_TO_BOTTOM_PX
}

function maxScrollTop(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

function scrollListToEnd(options: { smooth?: boolean } = {}) {
  const el = scrollViewportEl()
  if (!el) return
  const top = maxScrollTop(el)
  const smooth = options.smooth ?? false
  if (smooth) {
    el.scrollTo({ top, behavior: 'smooth' })
  } else {
    el.scrollTop = top
  }
}

/** Дождаться layout после Vue и следующего кадра(ов), чтобы scrollHeight был верным. */
async function flushScrollToBottomAfterHistory(): Promise<void> {
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  scrollListToEnd({ smooth: false })
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  scrollListToEnd({ smooth: false })
}

async function loadHistory() {
  loadError.value = null
  messages.value = []
  nextCursor.value = null
  if (pinHistoryClearTimer) {
    clearTimeout(pinHistoryClearTimer)
    pinHistoryClearTimer = null
  }
  pinHistoryToBottom.value = false
  if (!chatId.value) return
  try {
    const { messages: list, nextCursor: nc } = await messenger.fetchMessages(
      chatId.value,
    )
    pinHistoryToBottom.value = true
    pinHistoryClearTimer = setTimeout(() => {
      pinHistoryToBottom.value = false
      pinHistoryClearTimer = null
    }, 5000)
    messages.value = list.map(dtoToRow)
    nextCursor.value = nc
    await flushScrollToBottomAfterHistory()
    maybeMarkRead()
  } catch {
    pinHistoryToBottom.value = false
    loadError.value = 'Не удалось загрузить сообщения'
  }
}

async function loadOlder() {
  const id = chatId.value
  const cursor = nextCursor.value
  if (!id || !cursor || loadingOlder.value) return
  const el = scrollViewportEl()
  if (!el) return
  loadingOlder.value = true
  const prevHeight = el.scrollHeight
  const prevTop = el.scrollTop
  try {
    const { messages: list, nextCursor: nc } = await messenger.fetchMessages(
      id,
      cursor,
    )
    nextCursor.value = nc
    const existing = new Set(messages.value.map((m) => m.id))
    const older = list.map(dtoToRow).filter((m) => !existing.has(m.id))
    if (older.length > 0) {
      messages.value = [...older, ...messages.value]
    }
    await nextTick()
    el.scrollTop = el.scrollHeight - prevHeight + prevTop
  } catch {
    /* тихо: не сбрасываем список */
  } finally {
    loadingOlder.value = false
  }
}

const debouncedCheckLoadOlder = useDebounceFn(() => {
  const el = scrollViewportEl()
  if (!el || loadingOlder.value || !nextCursor.value) return
  if (el.scrollTop < SCROLL_LOAD_OLDER_PX) {
    void loadOlder()
  }
}, 120)

function onMessagesScroll() {
  const el = scrollViewportEl()
  if (el && !isNearBottom()) {
    pinHistoryToBottom.value = false
    if (pinHistoryClearTimer) {
      clearTimeout(pinHistoryClearTimer)
      pinHistoryClearTimer = null
    }
  }
  debouncedCheckLoadOlder()
}

watchEffect((onCleanup) => {
  const el = messagesScrollContentRef.value
  if (!el) return
  const ro = new ResizeObserver(() => {
    if (!pinHistoryToBottom.value) return
    const box = scrollViewportRef.value
    if (!box) return
    box.scrollTop = maxScrollTop(box)
  })
  ro.observe(el)
  onCleanup(() => ro.disconnect())
})

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
  window.addEventListener('keydown', onLightboxKeydown)
})

onBeforeUnmount(() => {
  if (pinHistoryClearTimer) {
    clearTimeout(pinHistoryClearTimer)
    pinHistoryClearTimer = null
  }
  window.removeEventListener('keydown', onLightboxKeydown)
  messenger.setFocusedChatId(null)
  socketBound?.off('newMessage', onNewMessage)
  socketBound?.off('messageStatus', onMessageStatus)
  socketBound = null
  for (const p of selectedPreviews.value) {
    URL.revokeObjectURL(p.objectUrl)
  }
  for (const m of messages.value) {
    for (const a of m.attachments ?? []) {
      if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url)
    }
  }
})

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  selectedFiles.value = [...(input.files ?? [])]
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function clearSelectedFiles() {
  selectedFiles.value = []
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function removeSelectedFileAt(index: number) {
  selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function openComposerNonImagePreview(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

watch(
  selectedFiles,
  (files) => {
    for (const p of selectedPreviews.value) {
      URL.revokeObjectURL(p.objectUrl)
    }
    selectedPreviews.value = files.map((f) => ({
      objectUrl: URL.createObjectURL(f),
      name: f.name,
      isImage: f.type.startsWith('image/'),
    }))
  },
  { deep: true },
)

const canSendSomething = computed(() => {
  const hasText = !!draft.value.trim()
  const hasFiles = selectedFiles.value.length > 0
  return hasText || hasFiles
})

async function uploadSelectedFiles() {
  const id = chatId.value
  const files = selectedFiles.value
  if (!id || files.length === 0) return

  const s = messenger.ensureSocket()
  if (!s?.connected) {
    loadError.value = 'Нет соединения с сервером'
    return
  }

  const caption = draft.value.trim()
  const tempId = `temp-${Math.random().toString(36).slice(2)}-${Date.now()}`
  const localAttachments: MessageAttachmentDto[] = files.map((f) => ({
    kind: f.type.startsWith('image/') ? 'image' : 'file',
    url: URL.createObjectURL(f),
    mimeType: f.type || 'application/octet-stream',
    fileName: f.name,
  }))

  messages.value.push({
    id: tempId,
    senderId: auth.user?.id ?? '',
    text: caption,
    attachments: localAttachments,
    createdAt: Date.now(),
    deliveredAt: null,
    readAt: null,
    pendingAck: true,
    sendError: false,
  })
  draft.value = ''
  clearSelectedFiles()
  void nextTick(() => scrollListToEnd({ smooth: true }))

  const fd = new FormData()
  if (caption) fd.append('content', caption)
  for (const f of files) {
    fd.append('files', f)
  }

  try {
    const res = await apiUpload(`/chats/${id}/messages/files`, fd)
    const dto = (await res.json()) as MessageDto
    const tempIdx = messages.value.findIndex((m) => m.id === tempId)
    for (const a of localAttachments) {
      if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url)
    }
    if (tempIdx !== -1) {
      messages.value[tempIdx] = dtoToRow(dto)
      return
    }
    if (!messages.value.some((m) => m.id === dto.id)) {
      messages.value.push(dtoToRow(dto))
    }
  } catch {
    const idx = messages.value.findIndex((m) => m.id === tempId)
    if (idx !== -1) {
      const row = messages.value[idx]!
      for (const a of row.attachments ?? []) {
        if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url)
      }
      row.sendError = true
      row.pendingAck = false
    }
    loadError.value = 'Не удалось отправить файлы'
  }
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
  const tempId = `temp-${Math.random().toString(36).slice(2)}-${Date.now()}`
  messages.value.push({
    id: tempId,
    senderId: auth.user?.id ?? '',
    text,
    attachments: null,
    createdAt: Date.now(),
    deliveredAt: null,
    readAt: null,
    pendingAck: true,
    sendError: false,
  })
  draft.value = ''
  void nextTick(() => scrollListToEnd({ smooth: true }))

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

function submitComposer() {
  if (selectedFiles.value.length > 0) {
    void uploadSelectedFiles()
    return
  }
  send()
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  e.preventDefault()
  if (!canSendSomething.value) return
  submitComposer()
}

const acceptFiles =
  'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip'
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <header class="border-b px-4 py-3">
      <h1 class="text-base font-semibold">
        {{ peerTitle ?? 'Чат' }}
      </h1>
      <p
        v-if="peerRow?.peer"
        class="text-muted-foreground mt-0.5 text-sm"
      >
        {{ peerIsOnline ? 'В сети' : 'Не в сети' }}
      </p>
      <p
        v-else-if="!peerTitle && chatId"
        class="text-muted-foreground mt-0.5 truncate text-sm"
      >
        Загрузка…
      </p>
    </header>

    <div
      ref="scrollViewportRef"
      class="focus-visible:ring-ring/50 relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:outline-1 [overflow-anchor:none]"
      @scroll.passive="onMessagesScroll"
    >
      <div ref="messagesScrollContentRef">
      <p
        v-if="loadingOlder"
        class="text-muted-foreground bg-background/90 pointer-events-none absolute start-4 top-2 z-10 flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm shadow-sm"
        aria-live="polite"
      >
        <Loader2
          class="size-4 shrink-0 animate-spin"
          aria-hidden="true"
        />
        Загрузка истории…
      </p>
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
        Пока нет сообщений — напишите или прикрепите файл.
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
            <div
              :class="
                isOutgoing(m)
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2 text-sm'
                  : 'bg-muted text-foreground rounded-2xl rounded-bl-md px-3 py-2 text-sm'
              "
              class="flex min-w-0 flex-col gap-2"
            >
              <div
                v-if="m.attachments?.length"
                class="flex flex-col gap-2"
              >
                <template
                  v-for="(a, i) in m.attachments"
                  :key="`${m.id}-${i}-${a.url}`"
                >
                  <button
                    v-if="a.kind === 'image'"
                    type="button"
                    class="focus-visible:ring-ring block max-h-48 max-w-full overflow-hidden rounded-lg outline-none focus-visible:ring-2"
                    @click="openLightbox(a.url, thumbVtName(m.id, i))"
                  >
                    <img
                      :src="a.url"
                      :alt="a.fileName"
                      class="max-h-48 w-full max-w-xs object-cover"
                      :style="{
                        viewTransitionName: isThumbVtSuppressed(
                          thumbVtName(m.id, i),
                        )
                          ? 'none'
                          : thumbVtName(m.id, i),
                      }"
                    >
                  </button>
                  <a
                    v-else
                    :href="a.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline decoration-1 underline-offset-2"
                    :class="
                      isOutgoing(m)
                        ? 'text-primary-foreground/90'
                        : 'text-primary'
                    "
                  >
                    {{ a.fileName }}
                  </a>
                </template>
              </div>
              <p
                v-if="m.text.trim()"
                class="whitespace-pre-wrap break-words"
              >
                {{ m.text }}
              </p>
            </div>
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
      </div>
    </div>

    <footer class="border-t p-3">
      <input
        ref="fileInputRef"
        type="file"
        class="sr-only"
        :accept="acceptFiles"
        multiple
        @change="onFileInputChange"
      >
      <div
        v-if="selectedPreviews.length > 0"
        class="mb-2 flex flex-wrap gap-2"
      >
        <div
          v-for="(p, i) in selectedPreviews"
          :key="`${p.objectUrl}-${i}`"
          class="relative"
        >
          <button
            v-if="p.isImage"
            type="button"
            class="focus-visible:ring-ring block size-16 shrink-0 overflow-hidden rounded-lg border border-border outline-none focus-visible:ring-2"
            :title="p.name"
            @click="openLightbox(p.objectUrl, composerPickVtName(i))"
          >
            <img
              :src="p.objectUrl"
              :alt="p.name"
              class="size-full object-cover"
              :style="{
                viewTransitionName: isThumbVtSuppressed(composerPickVtName(i))
                  ? 'none'
                  : composerPickVtName(i),
              }"
            >
          </button>
          <button
            v-else
            type="button"
            class="focus-visible:ring-ring flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-muted p-1 text-center outline-none focus-visible:ring-2"
            :title="p.name"
            @click="openComposerNonImagePreview(p.objectUrl)"
          >
            <FileIcon
              class="text-muted-foreground size-5 shrink-0"
              aria-hidden="true"
            />
            <span class="line-clamp-2 w-full text-[0.65rem] leading-tight">
              {{ p.name }}
            </span>
          </button>
          <button
            type="button"
            class="bg-background/90 text-foreground hover:bg-muted absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border shadow-sm"
            :aria-label="`Убрать ${p.name}`"
            @click.stop="removeSelectedFileAt(i)"
          >
            <X
              class="size-3"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <form
        class="flex gap-2"
        @submit.prevent="submitComposer"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Прикрепить файл"
          @click="openFilePicker"
        >
          <Paperclip class="size-4" />
        </Button>
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
          :disabled="!canSendSomething"
          aria-label="Отправить"
        >
          <Send class="size-4" />
        </Button>
      </form>
      <p
        v-if="selectedFiles.length > 0"
        class="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs"
      >
        <span>{{ selectedFiles.length }} файл(ов)</span>
        <button
          type="button"
          class="text-primary underline"
          @click="clearSelectedFiles"
        >
          Сбросить все
        </button>
      </p>
    </footer>

    <Teleport to="body">
      <div
        v-if="lightbox"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр изображения"
        @click.self="closeLightbox"
      >
        <button
          type="button"
          class="text-primary-foreground absolute end-3 top-3 rounded-md bg-white/10 px-2 py-1 text-sm"
          @click="closeLightbox"
        >
          Закрыть
        </button>
        <img
          :src="lightbox.src"
          alt=""
          class="max-h-[90vh] max-w-full object-contain"
          :style="{ viewTransitionName: lightbox.vtName }"
          @click.stop
        >
      </div>
    </Teleport>
  </div>
</template>

<style>
@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 0.35s;
  }
}
</style>