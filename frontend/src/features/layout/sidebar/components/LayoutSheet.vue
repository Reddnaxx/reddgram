<script setup lang="ts">
import {
  Archive,
  ChevronRight,
  Info,
  LogOut,
  Menu,
  Palette,
  Settings,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet'
import { ThemeToggle } from '@/shared/ui/theme-toggle'
import {
  formatProfileTitle,
  userAvatarLetterForPeer,
} from '@/shared/lib/user-display'
import { cn } from '@/shared/lib/utils'

const props = withDefaults(
  defineProps<{
    userPhone?: string | null
    userUsername?: string | null
    userFirstName?: string | null
    userLastName?: string | null
  }>(),
  {
    userPhone: null,
    userUsername: null,
    userFirstName: null,
    userLastName: null,
  },
)

const emit = defineEmits<{
  logout: []
}>()

const showProfile = computed(() => Boolean(props.userPhone?.trim()))

const fullName = computed(() => {
  const f = props.userFirstName?.trim() ?? ''
  const l = props.userLastName?.trim() ?? ''
  return `${f} ${l}`.trim()
})

/** Имя и фамилия, иначе @ник или телефон — как в профиле. */
const primaryDisplay = computed(() => {
  const phone = props.userPhone?.trim() ?? ''
  if (!phone) return ''
  if (fullName.value) return fullName.value
  return formatProfileTitle(
    props.userFirstName,
    props.userLastName,
    props.userUsername,
    phone,
  )
})

/** Подпись: при ФИО — @ник или телефон; при одном только @нике — телефон. */
const secondaryDisplay = computed(() => {
  const phone = props.userPhone?.trim() ?? ''
  if (!phone) return ''
  const u = props.userUsername?.trim()
  if (fullName.value) {
    if (u) return `@${u}`
    return phone
  }
  if (u) return phone
  return ''
})

const avatarLetter = computed(() => {
  const phone = props.userPhone?.trim() ?? ''
  if (!phone) return ''
  return userAvatarLetterForPeer({
    phone,
    username: props.userUsername,
    firstName: props.userFirstName,
    lastName: props.userLastName,
  })
})

const menuRowClass = cn(
  'flex w-full min-h-12 items-center gap-4 px-4 py-2.5 text-left text-[15px] leading-snug transition-colors',
  'hover:bg-black/[0.04] active:bg-black/[0.06] dark:hover:bg-white/[0.06] dark:active:bg-white/[0.08]',
  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
)
</script>

<template>
  <Sheet>
    <SheetTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="shrink-0"
        type="button"
      >
        <Menu class="size-4" />
        <span class="sr-only">Меню</span>
      </Button>
    </SheetTrigger>
    <SheetContent
      side="left"
      class="flex h-full min-h-0 w-[min(100%,20rem)] flex-col gap-0 border-r-0 bg-card p-0 shadow-xl"
    >
      <SheetHeader class="sr-only shrink-0 p-0">
        <SheetTitle>Меню</SheetTitle>
      </SheetHeader>

      <div
        v-if="showProfile"
        class="flex shrink-0 items-start gap-3 border-b border-border/80 pr-12 pt-6 pb-4 pl-4"
      >
        <span
          class="bg-primary text-primary-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold tracking-tight"
        >
          {{ avatarLetter }}
        </span>
        <div class="min-w-0 flex-1 pt-0.5">
          <p class="text-foreground truncate text-[17px] font-semibold leading-tight">
            {{ primaryDisplay }}
          </p>
          <p
            v-if="secondaryDisplay"
            class="text-muted-foreground mt-0.5 truncate text-[13px] leading-tight"
          >
            {{ secondaryDisplay }}
          </p>
        </div>
      </div>

      <div
        v-else
        class="shrink-0 pr-12 pt-5 pb-2 pl-4"
      />

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <nav
          class="flex min-h-0 flex-1 flex-col overflow-y-auto py-1"
          aria-label="Разделы меню"
        >
          <button
            type="button"
            :class="menuRowClass"
          >
            <Archive
              class="text-primary size-6 shrink-0"
              aria-hidden="true"
              :stroke-width="1.75"
            />
            <span class="text-foreground min-w-0 flex-1">Архив</span>
            <ChevronRight
              class="text-muted-foreground size-5 shrink-0 opacity-45"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            :class="menuRowClass"
          >
            <Settings
              class="text-primary size-6 shrink-0"
              aria-hidden="true"
              :stroke-width="1.75"
            />
            <span class="text-foreground min-w-0 flex-1">Настройки</span>
            <ChevronRight
              class="text-muted-foreground size-5 shrink-0 opacity-45"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            :class="menuRowClass"
          >
            <Info
              class="text-primary size-6 shrink-0"
              aria-hidden="true"
              :stroke-width="1.75"
            />
            <span class="text-foreground min-w-0 flex-1">О приложении</span>
            <ChevronRight
              class="text-muted-foreground size-5 shrink-0 opacity-45"
              aria-hidden="true"
            />
          </button>

          <div
            class="bg-border/80 mx-4 my-2 h-px shrink-0"
            role="separator"
          />

          <button
            type="button"
            :class="menuRowClass"
            @click="emit('logout')"
          >
            <LogOut
              class="text-destructive size-6 shrink-0"
              aria-hidden="true"
              :stroke-width="1.75"
            />
            <span class="text-destructive min-w-0 flex-1 font-medium">Выйти</span>
          </button>
        </nav>

        <div
          class="border-border/80 flex shrink-0 items-center gap-4 border-t px-4 py-2.5"
        >
          <Palette
            class="text-primary size-6 shrink-0"
            aria-hidden="true"
            :stroke-width="1.75"
          />
          <span class="text-foreground min-w-0 flex-1 text-[15px]">Оформление</span>
          <ThemeToggle class="shrink-0" />
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
