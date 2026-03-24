<script setup lang="ts">
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/ui/sidebar';
import type { MessengerChatItem } from '../types';

defineProps<{
  chat: MessengerChatItem
  isActive: boolean
}>()

const emit = defineEmits<{
  select: [chat: MessengerChatItem]
}>()

const displayInitials = (chat: MessengerChatItem) => {
  return chat.title.split(' ').map(word => word.charAt(0).toUpperCase()).join('')
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
      <span class="relative shrink-0">
        <span
          class="bg-primary text-primary-foreground flex size-9 items-center justify-center overflow-hidden rounded-full text-xs font-medium"
        >
          <img
            v-if="chat.avatarUrl"
            :src="chat.avatarUrl"
            :alt="chat.title"
            class="size-full object-cover"
          />
          <span v-else>{{ displayInitials(chat) }}</span>
        </span>
        <span
          v-if="chat.peerOnline !== undefined"
          class="border-background absolute end-0 bottom-0 size-2.5 rounded-full border-2"
          :class="
            chat.peerOnline ? 'bg-emerald-500' : 'bg-muted-foreground/50'
          "
          aria-hidden="true"
        />
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
