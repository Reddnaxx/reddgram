<script setup lang="ts">
import AuthLayout from '@/features/auth/AuthLayout.vue'
import { ApiError } from '@/shared/api/client'
import { normalizePhone, PHONE_MIN_DIGITS } from '@/shared/lib/phone'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useAuthStore } from '@/stores/auth'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const step = ref<1 | 2>(1)
const phone = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref<string | null>(null)

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const redirectTarget = computed(() => {
  const r = route.query.redirect
  const v = Array.isArray(r) ? r[0] : r
  if (typeof v === 'string' && v.startsWith('/')) {
    return v
  }
  return '/'
})

const phoneDigits = computed(() => normalizePhone(phone.value))

function goToPasswordStep() {
  errorMessage.value = null
  if (phoneDigits.value.length < PHONE_MIN_DIGITS) {
    errorMessage.value = `Введите не меньше ${PHONE_MIN_DIGITS} цифр номера`
    return
  }
  step.value = 2
  requestAnimationFrame(() => {
    document.getElementById('login-password')?.focus()
  })
}

function goBackToPhone() {
  errorMessage.value = null
  password.value = ''
  step.value = 1
}

async function onSubmit() {
  errorMessage.value = null
  submitting.value = true
  try {
    await auth.login(phoneDigits.value, password.value)
    await router.replace(redirectTarget.value)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Не удалось войти'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <p class="text-muted-foreground text-xs font-medium">
      Шаг {{ step }} из 2
    </p>
    <h1 class="text-xl font-semibold tracking-tight">
      {{ step === 1 ? 'Вход' : 'Пароль' }}
    </h1>
    <p class="text-muted-foreground mt-1.5 text-pretty text-sm leading-relaxed">
      <template v-if="step === 1">
        Введите номер телефона, привязанный к аккаунту
      </template>
      <template v-else>
        Введите пароль для номера
        <span class="text-foreground font-medium">{{ phoneDigits }}</span>
      </template>
    </p>

    <div class="mt-8 flex flex-col gap-4">
      <template v-if="step === 1">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="login-phone">Телефон</label>
          <Input
            id="login-phone"
            v-model="phone"
            type="tel"
            autocomplete="tel"
            placeholder="+7 900 000-00-00"
            @keydown.enter.prevent="goToPasswordStep"
          />
        </div>
        <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
          {{ errorMessage }}
        </p>
        <Button type="button" class="w-full" @click="goToPasswordStep">
          Продолжить
        </Button>
      </template>

      <form v-else class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="login-password">Пароль</label>
          <Input
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>
        <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
          {{ errorMessage }}
        </p>
        <div class="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            class="w-full"
            :disabled="submitting"
            @click="goBackToPhone"
          >
            Назад
          </Button>
          <Button type="submit" class="w-full" :disabled="submitting">
            {{ submitting ? 'Вход…' : 'Войти' }}
          </Button>
        </div>
      </form>
    </div>

    <p class="text-muted-foreground mt-6 text-center text-sm">
      Нет аккаунта?
      <RouterLink
        to="/register"
        class="text-primary font-medium underline-offset-4 hover:underline"
      >
        Регистрация
      </RouterLink>
    </p>
  </AuthLayout>
</template>
