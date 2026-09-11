import { expect, test } from '@playwright/test'

test('critical content lifecycle smoke flow', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('reza@shifdlabs.com')
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Create Content', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create Content', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Continue to Generate/ }).click()
  await page.getByRole('button', { name: /Continue to Platform Adaptation/ }).click()
  await page.getByRole('button', { name: /Continue to Creative/ }).click()
  await page.getByRole('button', { name: /Continue to Review/ }).click()

  for (const label of ['Copy reviewed', 'Creative reviewed', 'Visual and copy are consistent', 'No obvious typo or incorrect claim', 'Ready for publication']) {
    await page.getByLabel(label, { exact: true }).check()
  }
  await page.getByRole('button', { name: /Approve Content/ }).click()
  await page.getByRole('button', { name: /Continue to Schedule/ }).click()
  await page.getByRole('button', { name: /Schedule Content/ }).click()
  await expect(page.getByText('Ready for manual publication', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Content Library', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Content Library', exact: true })).toBeVisible()
  const title = 'Digital Approval vs Traditional Paper Approval'
  await page.getByRole('button', { name: title }).first().click()
  await expect(page).toHaveURL(/\/content\//)
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/calendar$/)
  const instagramEntry = page.locator('.calendar-entry.is-instagram').filter({ hasText: title }).first()
  await expect(instagramEntry).toBeVisible()
  await instagramEntry.click()
  await page.getByRole('button', { name: 'Mark as Published', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Publication', exact: true }).click()
  await expect(page.getByText('Instagram marked as published.', { exact: true })).toBeVisible()

  const linkedinEntry = page.locator('.calendar-entry.is-linkedin').filter({ hasText: title }).first()
  await linkedinEntry.click()
  await page.getByRole('button', { name: 'Mark as Published', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Publication', exact: true }).click()
  await expect(page.getByText('LinkedIn marked as published.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'View Content', exact: true }).click()
  await expect(page).toHaveURL(/\/content\//)
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Performance', exact: true }).click()
  await expect(page).toHaveURL(/\/performance$/)
})
