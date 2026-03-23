<template>
  <div
    class="text-foreground relative isolate flex min-h-svh flex-col overflow-hidden bg-background"
  >
    <div
      class="auth-backdrop pointer-events-none absolute inset-0 -z-10"
      aria-hidden="true"
    />

    <main
      class="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6"
    >
      <RouterLink
        to="/"
        class="group mb-10 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:mb-11"
      >
        <div
          class="relative flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6"
        >
          <div
            class="bg-primary/20 group-hover:bg-primary/28 absolute inset-0 -z-10 scale-110 rounded-4xl blur-3xl transition-colors duration-300 dark:bg-primary/15 dark:group-hover:bg-primary/25"
            aria-hidden="true"
          />
          <div
            class="bg-primary text-primary-foreground flex size-16 shrink-0 items-center justify-center rounded-2xl text-xl font-black tracking-tighter shadow-lg ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-[1.04] dark:ring-white/10 sm:size-17 sm:rounded-3xl sm:text-[1.65rem]"
            aria-hidden="true"
          >
            RG
          </div>
          <div class="max-w-[16rem] text-center sm:max-w-none sm:text-left">
            <span
              class="text-primary block text-[clamp(1.85rem,5.5vw,2.65rem)] font-black leading-none tracking-[-0.04em]"
            >
              Reddgram
            </span>
            <span
              class="text-muted-foreground mt-2.5 block text-[0.7rem] font-medium uppercase tracking-[0.22em] sm:mt-3"
            >
              чаты и сообщества
            </span>
          </div>
        </div>
      </RouterLink>

      <div
        class="border-border bg-card text-card-foreground w-full max-w-[420px] rounded-2xl border p-7 shadow-sm dark:shadow-none"
      >
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-backdrop {
  background:
    linear-gradient(
      168deg,
      color-mix(in oklch, var(--primary) 7%, transparent) 0%,
      transparent 38%
    ),
    radial-gradient(
      ellipse 100% 65% at 50% -30%,
      color-mix(in oklch, var(--primary) 12%, transparent),
      transparent 55%
    );
}
</style>
