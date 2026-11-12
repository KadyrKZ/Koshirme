<script setup lang="ts">
import { riskClass } from '../services/labels';
defineProps<{ score: number }>();
</script>
<template>
  <span class="risk-badge" :class="riskClass(score)"
    ><span class="risk-dot" />{{ score }}<span class="risk-max">/ 100</span></span
  >
</template>
