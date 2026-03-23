<script setup lang="ts">
import type { MessengerChatItem } from '../types'
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/ui/sidebar'

defineProps<{
  chat: MessengerChatItem
  isActive: boolean
}>()

const emit = defineEmits<{
  select: [chat: MessengerChatItem]
}>()

const displayInitials = (chat: MessengerChatItem) => {
  return chat.title.charAt(0).toUpperCase()
}
</script>

<template>
  <SidebarMenuItem>
    <SidebarMenuButton
      :is-active="isActive"
      class="h-auto min-h-10 gap-3 py-2"
      type="button"
      @click="emit('select', chat)"
    >
      <span
        class="bg-sidebar-accent text-sidebar-accent-foreground flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-medium"
      >
        <img
          v-if="chat.avatarUrl"
          :src="chat.avatarUrl"
          :alt="chat.title"
          class="size-full object-cover"
        />
        <span v-else>{{ displayInitials(chat) }}</span>
      </span>
      <span class="min-w-0 flex-1 text-left">
        <span class="block truncate font-medium">{{ chat.title }}</span>
        <span
          v-if="chat.subtitle"
          class="text-muted-foreground block truncate text-xs"
        >
          {{ chat.subtitle }}
        </span>
      </span>
    </SidebarMenuButton>
    <SidebarMenuBadge v-if="chat.unreadCount && chat.unreadCount > 0">
      {{ chat.unreadCount }}
    </SidebarMenuBadge>
  </SidebarMenuItem>
</template>
