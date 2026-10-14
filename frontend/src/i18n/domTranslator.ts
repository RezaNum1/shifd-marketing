import { watch, type Ref } from 'vue'
import { translate, type Language } from './dictionary'

type TranslationRecord = { source: string; rendered: string }
const translatedText = new WeakMap<Text, TranslationRecord>()
const translatedAttributes = new WeakMap<Element, Map<string, TranslationRecord>>()
const translatableAttributes = ['aria-label', 'aria-description', 'placeholder', 'title']

function setText(node: Text, language: Language) {
  const current = node.data
  const record = translatedText.get(node)
  const source = record && current === record.rendered ? record.source : current
  const rendered = translate(source, language)
  translatedText.set(node, { source, rendered })
  if (rendered !== current) node.data = rendered
}

function setAttribute(element: Element, name: string, language: Language) {
  const current = element.getAttribute(name)
  if (current === null) return
  let records = translatedAttributes.get(element)
  if (!records) {
    records = new Map()
    translatedAttributes.set(element, records)
  }
  const record = records.get(name)
  const source = record && current === record.rendered ? record.source : current
  const rendered = translate(source, language)
  records.set(name, { source, rendered })
  if (rendered !== current) element.setAttribute(name, rendered)
}

function applyElement(element: Element, language: Language) {
  if (element.closest('.language-picker')) return
  if (element instanceof HTMLElement && (element.isContentEditable || element.closest('textarea'))) return
  for (const name of translatableAttributes) setAttribute(element, name, language)
  for (const node of element.childNodes) {
    if (node instanceof Text && !element.closest('script, style, textarea, [contenteditable="true"], .language-picker')) setText(node, language)
  }
}

/** Applies the shared UI dictionary to current and newly rendered Vue content. */
export function installDomTranslator(root: HTMLElement, language: Ref<Language>) {
  let activeLanguage = language.value
  const applyTree = () => {
    for (const element of [root, ...root.querySelectorAll('*')]) applyElement(element, activeLanguage)
  }
  const applySubtree = (element: Element) => {
    for (const descendant of [element, ...element.querySelectorAll('*')]) applyElement(descendant, activeLanguage)
  }
  applyTree()

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' && mutation.target instanceof Text) {
        if (mutation.target.parentElement?.closest('.language-picker')) continue
        setText(mutation.target, activeLanguage)
      } else if (mutation.type === 'attributes' && mutation.target instanceof Element && mutation.attributeName) {
        setAttribute(mutation.target, mutation.attributeName, activeLanguage)
      } else {
        for (const added of mutation.addedNodes) {
          if (added instanceof Element) applySubtree(added)
          else if (added instanceof Text && !added.parentElement?.closest('.language-picker')) setText(added, activeLanguage)
        }
      }
    }
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: translatableAttributes })
  const stop = watch(language, (value) => {
    activeLanguage = value
    applyTree()
    document.documentElement.lang = value
  })
  return () => {
    observer.disconnect()
    stop()
  }
}
