<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useDark } from '@vueuse/core'
import { Button } from '@/shared/ui/button'

const isDark = useDark({ storageKey: 'reddgram-color-scheme' })
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    class="shrink-0"
    type="button"
    :aria-pressed="isDark"
    @click="isDark = !isDark"
  >
    <Moon
      v-if="!isDark"
      class="size-4"
      aria-hidden="true"
    />
    <Sun
      v-else
      class="size-4"
      aria-hidden="true"
    />
    <span class="sr-only">{{ isDark ? 'Светлая тема' : 'Тёмная тема' }}</span>
  </Button>
</template>
