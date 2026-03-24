<script setup lang="ts">
import AuthLayout from '@/features/auth/AuthLayout.vue'
import { ApiError, apiFetch } from '@/shared/api/client'
import {
  normalizePersonName,
  PERSON_NAME_PATTERN,
} from '@/shared/lib/name'
import { normalizePhone, PHONE_MIN_DIGITS } from '@/shared/lib/phone'
import { normalizeUsername, USERNAME_PATTERN } from '@/shared/lib/username'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useAuthStore } from '@/stores/auth'
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const PASSWORD_MIN = 8
const USERNAME_CHECK_DEBOUNCE_MS = 350

const step = ref<1 | 2 | 3 | 4>(1)
const phone = ref('')
const usernameRaw = ref('')
const firstName = ref('')
const lastName = ref('')
const password = ref('')
const passwordConfirm = ref('')
const submitting = ref(false)
const errorMessage = ref<string | null>(null)

const checkingUsername = ref(false)
const usernameAvailable = ref<boolean | null>(null)
const usernameHint = ref<string | null>(null)

const auth = useAuthStore()
const router = useRouter()

const phoneDigits = computed(() => normalizePhone(phone.value))
const usernameNormalized = computed(() => normalizeUsername(usernameRaw.value))
const firstNameNorm = computed(() => normalizePersonName(firstName.value))
const lastNameNorm = computed(() => normalizePersonName(lastName.value))

let usernameDebounceTimer: ReturnType<typeof setTimeout> | null = null
let usernameCheckAbort: AbortController | null = null

function clearUsernameDebounce() {
  if (usernameDebounceTimer) {
    clearTimeout(usernameDebounceTimer)
    usernameDebounceTimer = null
  }
}

onUnmounted(() => {
  clearUsernameDebounce()
  usernameCheckAbort?.abort()
})

function goToUsernameStep() {
  errorMessage.value = null
  if (phoneDigits.value.length < PHONE_MIN_DIGITS) {
    errorMessage.value = `Введите не меньше ${PHONE_MIN_DIGITS} цифр номера`
    return
  }
  step.value = 2
  requestAnimationFrame(() => {
    document.getElementById('reg-username')?.focus()
  })
}

function scheduleUsernameAvailabilityCheck() {
  usernameHint.value = null
  usernameAvailable.value = null
  usernameCheckAbort?.abort()
  clearUsernameDebounce()

  const u = usernameNormalized.value
  if (!u) {
    checkingUsername.value = false
    return
  }
  if (!USERNAME_PATTERN.test(u)) {
    usernameHint.value =
      '5–32 символа, с буквы, латиница, цифры и подчёркивание'
    checkingUsername.value = false
    return
  }

  usernameDebounceTimer = setTimeout(() => {
    usernameDebounceTimer = null
    void runUsernameAvailabilityCheck()
  }, USERNAME_CHECK_DEBOUNCE_MS)
}

async function runUsernameAvailabilityCheck() {
  const u = usernameNormalized.value
  if (!u || !USERNAME_PATTERN.test(u)) return

  usernameCheckAbort = new AbortController()
  const signal = usernameCheckAbort.signal
  checkingUsername.value = true
  try {
    const res = await apiFetch(
      `/users/username-available?username=${encodeURIComponent(u)}`,
      { signal },
    )
    const data = (await res.json()) as { available: boolean }
    usernameAvailable.value = data.available
    usernameHint.value = data.available ? null : 'Этот ник уже занят'
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    if (e instanceof ApiError) {
      usernameHint.value = e.message
    } else {
      usernameHint.value = 'Не удалось проверить ник'
    }
    usernameAvailable.value = null
  } finally {
    checkingUsername.value = false
  }
}

function goToNameStep() {
  errorMessage.value = null
  const u = usernameNormalized.value
  if (!USERNAME_PATTERN.test(u)) {
    errorMessage.value = 'Введите корректный ник'
    return
  }
  if (usernameAvailable.value !== true) {
    errorMessage.value = 'Дождитесь проверки и выберите свободный ник'
    return
  }
  step.value = 3
  requestAnimationFrame(() => {
    document.getElementById('reg-first-name')?.focus()
  })
}

function goToPasswordStep() {
  errorMessage.value = null
  const fn = firstNameNorm.value
  const ln = lastNameNorm.value
  if (!fn) {
    errorMessage.value = 'Укажите имя'
    return
  }
  if (!PERSON_NAME_PATTERN.test(fn)) {
    errorMessage.value =
      'Допустимы буквы (в т.ч. кириллица), пробел, дефис и апостроф'
    return
  }
  if (ln && !PERSON_NAME_PATTERN.test(ln)) {
    errorMessage.value =
      'Допустимы буквы (в т.ч. кириллица), пробел, дефис и апостроф'
    return
  }
  step.value = 4
  requestAnimationFrame(() => {
    document.getElementById('reg-password')?.focus()
  })
}

function goBackToUsername() {
  errorMessage.value = null
  firstName.value = ''
  lastName.value = ''
  password.value = ''
  passwordConfirm.value = ''
  step.value = 2
}

function goBackToName() {
  errorMessage.value = null
  password.value = ''
  passwordConfirm.value = ''
  step.value = 3
}

function focusLastNameField() {
  document.getElementById('reg-last-name')?.focus()
}

function goBackToPhone() {
  errorMessage.value = null
  usernameRaw.value = ''
  usernameAvailable.value = null
  usernameHint.value = null
  firstName.value = ''
  lastName.value = ''
  password.value = ''
  passwordConfirm.value = ''
  clearUsernameDebounce()
  usernameCheckAbort?.abort()
  step.value = 1
}

async function onSubmit() {
  errorMessage.value = null
  if (password.value.length < PASSWORD_MIN) {
    errorMessage.value = `Пароль не короче ${PASSWORD_MIN} символов`
    return
  }
  if (password.value !== passwordConfirm.value) {
    errorMessage.value = 'Пароли не совпадают'
    return
  }
  submitting.value = true
  try {
    await auth.register(
      phoneDigits.value,
      usernameNormalized.value,
      firstNameNorm.value,
      lastNameNorm.value,
      password.value,
    )
    await router.replace('/')
  } catch (e) {
    errorMessage.value =
      e instanceof ApiError ? e.message : 'Не удалось зарегистрироваться'
  } finally {
    submitting.value = false
  }
}

const stepTitle = computed(() => {
  if (step.value === 1) return 'Регистрация'
  if (step.value === 2) return 'Выберите ник'
  if (step.value === 3) return 'Ваше имя'
  return 'Придумайте пароль'
})

const stepSubtitle = computed(() => {
  if (step.value === 1) {
    return 'Сначала укажите номер телефона — он будет вашим логином'
  }
  if (step.value === 2) {
    return `Номер: ${phoneDigits.value} — придумайте публичный @ник (как в Telegram)`
  }
  if (step.value === 3) {
    return `Ник: @${usernameNormalized.value} — как вас показывать в чатах`
  }
  const name = [firstNameNorm.value, lastNameNorm.value]
    .filter(Boolean)
    .join(' ')
  return `${name} — пароль не короче ${PASSWORD_MIN} символов`
})
</script>

<template>
  <AuthLayout>
    <p class="text-muted-foreground text-xs font-medium">
      Шаг {{ step }} из 4
    </p>
    <h1 class="text-xl font-semibold tracking-tight">
      {{ stepTitle }}
    </h1>
    <p class="text-muted-foreground mt-1.5 text-pretty text-sm leading-relaxed">
      {{ stepSubtitle }}
    </p>

    <div class="mt-8 flex flex-col gap-4">
      <template v-if="step === 1">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="reg-phone">Телефон</label>
          <Input
            id="reg-phone"
            v-model="phone"
            type="tel"
            autocomplete="tel"
            placeholder="+7 900 000-00-00"
            @keydown.enter.prevent="goToUsernameStep"
          />
        </div>
        <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
          {{ errorMessage }}
        </p>
        <Button type="button" class="w-full" @click="goToUsernameStep">
          Продолжить
        </Button>
      </template>

      <template v-else-if="step === 2">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="reg-username">Ник</label>
          <div class="relative flex items-center gap-1">
            <span
              class="text-muted-foreground pointer-events-none absolute left-3 text-sm"
              aria-hidden="true"
            >@</span>
            <Input
              id="reg-username"
              v-model="usernameRaw"
              type="text"
              autocomplete="username"
              placeholder="username"
              class="pl-7"
              autocapitalize="off"
              spellcheck="false"
              @input="scheduleUsernameAvailabilityCheck"
              @keydown.enter.prevent="goToNameStep"
            />
          </div>
          <p v-if="checkingUsername" class="text-muted-foreground text-xs">
            Проверяем…
          </p>
          <p
            v-else-if="usernameAvailable === true"
            class="text-xs text-emerald-600 dark:text-emerald-500"
          >
            Ник свободен
          </p>
          <p
            v-else-if="usernameHint"
            class="text-destructive text-xs"
            role="status"
          >
            {{ usernameHint }}
          </p>
        </div>
        <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
          {{ errorMessage }}
        </p>
        <div class="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            class="w-full"
            @click="goBackToPhone"
          >
            Назад
          </Button>
          <Button
            type="button"
            class="w-full"
            :disabled="
              checkingUsername
                || usernameAvailable !== true
            "
            @click="goToNameStep"
          >
            Продолжить
          </Button>
        </div>
      </template>

      <template v-else-if="step === 3">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="reg-first-name">Имя</label>
          <Input
            id="reg-first-name"
            v-model="firstName"
            type="text"
            autocomplete="given-name"
            placeholder="Иван"
            @keydown.enter.prevent="focusLastNameField"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="reg-last-name">
            Фамилия <span class="text-muted-foreground font-normal">(необязательно)</span>
          </label>
          <Input
            id="reg-last-name"
            v-model="lastName"
            type="text"
            autocomplete="family-name"
            placeholder="По желанию"
            @keydown.enter.prevent="goToPasswordStep"
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
            @click="goBackToUsername"
          >
            Назад
          </Button>
          <Button type="button" class="w-full" @click="goToPasswordStep">
            Продолжить
          </Button>
        </div>
      </template>

      <form v-else class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="reg-password">Пароль</label>
          <Input
            id="reg-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            :minlength="PASSWORD_MIN"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium" for="reg-password-confirm">
            Повторите пароль
          </label>
          <Input
            id="reg-password-confirm"
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            required
            :minlength="PASSWORD_MIN"
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
            @click="goBackToName"
          >
            Назад
          </Button>
          <Button type="submit" class="w-full" :disabled="submitting">
            {{ submitting ? 'Создание…' : 'Создать аккаунт' }}
          </Button>
        </div>
      </form>
    </div>

    <p class="text-muted-foreground mt-6 text-center text-sm">
      Уже есть аккаунт?
      <RouterLink
        to="/login"
        class="text-primary font-medium underline-offset-4 hover:underline"
      >
        Вход
      </RouterLink>
    </p>
  </AuthLayout>
</template>
