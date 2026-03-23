<script lang="ts" setup>
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar'
import { ThemeToggle } from '@/shared/ui/theme-toggle'
import { LayoutSidebar } from './sidebar'
</script>

<template>
  <SidebarProvider>
    <LayoutSidebar />
    <SidebarInset>
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
        <SidebarTrigger />
        <span class="text-sm font-medium">Reddgram</span>
        <ThemeToggle class="ml-auto" />
      </header>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
