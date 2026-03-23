<script setup lang="ts">
import { Layout } from '@/features/layout'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isPublicAuth = computed(() => Boolean(route.meta.publicAuth))
</script>

<template>
  <Layout v-if="!isPublicAuth">
    <RouterView />
  </Layout>
  <RouterView v-else />
</template>
