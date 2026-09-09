import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { pages } from './navigation'

const routes: RouteRecordRaw[] = pages.map((page) => ({
  path: page.path,
  name: page.name,
  component:
    page.name === 'create-content'
      ? () => import('../views/ContentCreateView.vue')
      : () => import('../views/PlaceholderView.vue'),
  meta: {
    title: page.title,
    description: page.description,
    icon: page.icon,
    navigationKey: page.navigationKey,
    breadcrumbs: [
      { label: page.group },
      ...(page.parent ? [page.parent] : []),
      { label: page.title },
    ],
  },
}))

routes.push({
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('../views/NotFoundView.vue'),
  meta: {
    title: 'Page not found',
    description: 'The page you are looking for is not available.',
    icon: 'search',
    breadcrumbs: [{ label: 'Page not found' }],
  },
})

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
})

router.afterEach((to) => {
  document.title = `${to.meta.title} · Shifd Marketing`
})
