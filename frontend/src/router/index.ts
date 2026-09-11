import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { pages } from './navigation'
import { useAuthStore } from '../stores/auth'

const routes: RouteRecordRaw[] = pages.map((page) => ({
  path: page.path,
  name: page.name,
  component:
    page.name === 'overview'
      ? () => import('../views/OverviewView.vue')
      : page.name === 'company'
      ? () => import('../views/CompanyContextView.vue')
      : page.name === 'products'
        ? () => import('../views/ProductsView.vue')
        : page.name === 'product-detail'
          ? () => import('../views/ProductContextView.vue')
          : page.name === 'ideas'
            ? () => import('../views/ContentIdeasView.vue')
            : page.name === 'create-content'
              ? () => import('../views/ContentCreateView.vue')
              : page.name === 'content-library'
                ? () => import('../views/ContentLibraryView.vue')
                : page.name === 'content-detail'
                  ? () => import('../views/ContentDetailView.vue')
                  : page.name === 'calendar'
                    ? () => import('../views/CalendarView.vue')
                    : page.name === 'performance'
                      ? () => import('../views/PerformanceView.vue')
                    : page.name === 'performance-linkedin'
                        ? () => import('../views/LinkedInMetricsView.vue')
                        : page.name === 'integrations'
                          ? () => import('../views/IntegrationsView.vue')
                        : page.name === 'ai-system'
                          ? () => import('../views/AiSystemView.vue')
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

routes.unshift({
  path: '/login',
  name: 'login',
  component: () => import('../views/LoginView.vue'),
  meta: {
    title: 'Sign In',
    description: 'Sign in to manage your marketing execution.',
    icon: 'system',
    breadcrumbs: [{ label: 'Sign In' }],
  },
})

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

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.name === 'login') return auth.isAuthenticated ? { path: '/' } : true
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title} · Shifd Marketing`
})
