<script setup lang="ts">
import { formatPeerTitle } from '@/shared/lib/user-display';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
} from '@/shared/ui/sidebar';
import { SIDEBAR_WIDTH_MAX_PX, SIDEBAR_WIDTH_MIN_PX } from '@/shared/ui/sidebar/utils';
import { useAuthStore } from '@/stores/auth';
import { useMessengerStore } from '@/stores/messenger';
import { Search, UserPlus } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessengerChats } from '../composables/useMessengerChats';
import type { MessengerChatItem } from '../types';
import LayoutSheet from './LayoutSheet.vue';
import LayoutSidebarChat from './LayoutSidebarChat.vue';

const USER_SEARCH_DEBOUNCE_MS = 350

const { chatItems, loadChats, ensureSocket } = useMessengerChats()
const { sidebarWidthPx, isMobile } = useSidebar()
const auth = useAuthStore()
const messenger = useMessengerStore()

const router = useRouter()
const activeChatId = computed(() => router.currentRoute.value.params.chatId as string)

const userSearchQuery = ref('')
const findResults = ref<
  {
    id: string
    phone: string
    username: string | null
    firstName: string | null
    lastName: string | null
  }[]
>([])
const finding = ref(false)
const findError = ref<string | null>(null)
const openingPeerId = ref<string | null>(null)

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  ensureSocket()
  await loadChats()
})

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
})

function clampSidebarWidth(px: number) {
  return Math.min(SIDEBAR_WIDTH_MAX_PX, Math.max(SIDEBAR_WIDTH_MIN_PX, Math.round(px)))
}

function handleChatClick(chat: MessengerChatItem) {
  router.push(`/chat/${chat.id}`)
}

function logout() {
  messenger.disconnectSocket()
  auth.logout()
  router.push('/login')
}

function clearSearchDebounce() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
}

function scheduleUserSearch() {
  clearSearchDebounce()
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null
    void runUserSearch()
  }, USER_SEARCH_DEBOUNCE_MS)
}

async function runUserSearchNow() {
  clearSearchDebounce()
  await runUserSearch()
}

async function runUserSearch() {
  findError.value = null
  finding.value = true
  try {
    const q = userSearchQuery.value.trim()
    if (!q) {
      findResults.value = []
      findError.value = null
      return
    }
    findResults.value = await messenger.searchUsers(q)
    if (findResults.value.length === 0) {
      findError.value = 'Никого не найдено'
    }
  } catch {
    findError.value = 'Не удалось выполнить поиск'
    findResults.value = []
  } finally {
    finding.value = false
  }
}

function resultLabel(u: {
  phone: string
  username: string | null
  firstName: string | null
  lastName: string | null
}) {
  return formatPeerTitle(u)
}

async function openChatWith(peerUserId: string) {
  openingPeerId.value = peerUserId
  findError.value = null
  try {
    const id = await messenger.createChat(peerUserId)
    findResults.value = []
    userSearchQuery.value = ''
    await router.push(`/chat/${id}`)
  } catch {
    findError.value = 'Не удалось открыть чат'
  } finally {
    openingPeerId.value = null
  }
}

function onResizeEdgePointerDown(e: PointerEvent) {
  if (isMobile.value) return
  e.preventDefault()
  const startX = e.clientX
  const startW = sidebarWidthPx.value
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)

  const prevUserSelect = document.body.style.userSelect
  const prevCursor = document.body.style.cursor
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'

  function onMove(ev: PointerEvent) {
    const delta = ev.clientX - startX
    sidebarWidthPx.value = clampSidebarWidth(startW + delta)
  }
  function onUp() {
    document.body.style.userSelect = prevUserSelect
    document.body.style.cursor = prevCursor
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    try {
      target.releasePointerCapture(e.pointerId)
    } catch {
      /* released */
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<template>
  <Sidebar>
    <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <SidebarHeader>
        <div class="flex flex-col">
          <div class="flex min-w-0 items-center gap-2">
            <LayoutSheet
              :user-phone="auth.user?.phone ?? null"
              :user-username="auth.user?.username ?? null"
              :user-first-name="auth.user?.firstName ?? null"
              :user-last-name="auth.user?.lastName ?? null"
              @logout="logout"
            />
            <div class="relative min-w-0 flex-1">
              <Search
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                v-model="userSearchQuery"
                type="search"
                placeholder="Телефон или @ник"
                class="h-8 w-full pl-9 shadow-none"
                autocomplete="off"
                @input="scheduleUserSearch"
                @keydown.enter.prevent="runUserSearchNow"
              />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <p
              v-if="findError"
              class="text-destructive px-0.5 text-xs"
            >
              {{ findError }}
            </p>
            <ul
              v-if="findResults.length > 0"
              class="border-border/80 max-h-28 overflow-y-auto rounded-md border"
            >
              <li
                v-for="u in findResults"
                :key="u.id"
                class="border-border/60 flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0"
              >
                <span class="min-w-0 flex-1 truncate text-sm">{{ resultLabel(u) }}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  class="h-7 shrink-0 gap-1 px-2"
                  :disabled="openingPeerId === u.id"
                  @click="openChatWith(u.id)"
                >
                  <UserPlus class="size-3.5" />
                  Написать
                </Button>
              </li>
            </ul>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator class="m-0" />

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <LayoutSidebarChat
              v-for="chat in chatItems"
              :key="chat.id"
              :chat="chat"
              :is-active="activeChatId === chat.id"
              @select="handleChatClick"
            />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <div
        class="hover:border-sidebar-border active:border-sidebar-border active:bg-sidebar-accent/80 hover:bg-sidebar-accent/50 absolute top-0 right-0 z-30 hidden h-full w-2 cursor-col-resize touch-none border-l border-transparent select-none md:block"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="sidebarWidthPx"
        :aria-valuemin="SIDEBAR_WIDTH_MIN_PX"
        :aria-valuemax="SIDEBAR_WIDTH_MAX_PX"
        @pointerdown="onResizeEdgePointerDown"
      />
    </div>
  </Sidebar>
</template>
