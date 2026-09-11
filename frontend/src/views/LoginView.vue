<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppBrand from '../components/app/AppBrand.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import FormField from '../components/ui/FormField.vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const form = reactive({ email: '', password: '' })
const errors = reactive({ email: '', password: '' })
const authError = ref('')
const showPassword = ref(false)
const submitting = ref(false)

function clearFieldError(field: 'email' | 'password') {
  errors[field] = ''
  authError.value = ''
}

function submit() {
  errors.email = form.email.trim() ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? '' : 'Enter a valid email address.') : 'Email is required.'
  errors.password = form.password ? '' : 'Password is required.'
  authError.value = ''
  if (errors.email || errors.password) return

  submitting.value = true
  window.setTimeout(() => {
    submitting.value = false
    if (!auth.login(form.email, form.password)) {
      authError.value = 'Incorrect email or password.'
      return
    }
    router.replace('/')
  }, 280)
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="login-brand"><AppBrand /></div>
      <div class="login-heading"><h1 id="login-title">Sign in to Shifd Marketing</h1><p>Sign in to manage your marketing execution.</p></div>
      <form class="login-form" novalidate @submit.prevent="submit">
        <BaseInput id="login-email" v-model="form.email" label="Email" type="email" placeholder="name@shifdlabs.com" autocomplete="email" required :error="errors.email" @input="clearFieldError('email')" />
        <FormField id="login-password" label="Password" :error="errors.password" required v-slot="{ describedBy }">
          <div class="login-password-field"><input id="login-password" v-model="form.password" class="ui-input" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required :aria-invalid="!!errors.password || undefined" :aria-describedby="describedBy" @input="clearFieldError('password')" /><button type="button" class="login-password-toggle" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button></div>
        </FormField>
        <p v-if="authError" class="login-error" role="alert">{{ authError }}</p>
        <BaseButton class="login-submit" type="submit" :loading="submitting">{{ submitting ? 'Signing in…' : 'Sign In' }}</BaseButton>
      </form>
      <p class="login-footnote">Internal access only.</p>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; place-items: center; min-height: 100dvh; padding: 24px; background: var(--color-canvas); }
.login-card { width: min(100%, 420px); padding: 34px; border: 1px solid var(--color-border); border-radius: var(--radius-dialog); background: var(--color-surface); box-shadow: var(--shadow-popover); }
.login-brand { display: flex; justify-content: center; margin-bottom: 34px; }
.login-heading { text-align: center; }
.login-heading h1 { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -.025em; }
.login-heading p { margin-top: 8px; color: var(--color-muted); font-size: 14px; line-height: 20px; }
.login-form { display: grid; gap: 18px; margin-top: 28px; }
.login-password-field { position: relative; }
.login-password-field .ui-input { padding-right: 62px; }
.login-password-toggle { position: absolute; top: 50%; right: 8px; min-height: 28px; padding: 3px 7px; transform: translateY(-50%); border-radius: var(--radius-control); color: var(--color-link); font-size: 12px; font-weight: 600; }
.login-password-toggle:hover { background: var(--color-well); }
.login-error { margin: -3px 0 0; color: var(--color-danger); font-size: 12px; line-height: 18px; }
.login-submit { width: 100%; margin-top: 2px; }
.login-footnote { margin-top: 22px; color: var(--color-subtle); font-size: 12px; text-align: center; }
@media (max-width: 480px) { .login-page { padding: 16px; } .login-card { padding: 26px 20px; } }
</style>
