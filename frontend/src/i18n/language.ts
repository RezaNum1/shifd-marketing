import { ref, watch } from 'vue'
import type { Language } from './dictionary'

const storageKey = 'shifd-language'
const initialLanguage: Language =
  typeof localStorage !== 'undefined' && localStorage.getItem(storageKey) === 'id'
    ? 'id'
    : 'en'

export const language = ref<Language>(initialLanguage)

watch(language, (value) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, value)
  if (typeof document !== 'undefined') document.documentElement.lang = value
})

if (typeof document !== 'undefined') document.documentElement.lang = language.value

export function setLanguage(value: Language) {
  language.value = value
}
