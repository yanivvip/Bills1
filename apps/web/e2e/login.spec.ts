import { expect, test } from '@playwright/test';
import { he, PASSWORD } from './helpers';

test('login page is in Hebrew, right-to-left, with no language switch', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: he.app.name })).toBeVisible();
  await expect(page.getByText(he.auth.hero)).toBeVisible();
  await expect(page.getByRole('button', { name: 'EN' })).toHaveCount(0);
});

test('wrong credentials show a friendly error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(he.auth.email).fill('nobody@test.dev');
  await page.getByLabel(he.auth.password).fill(PASSWORD);
  await page.getByRole('button', { name: he.auth.signIn, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(he.auth.error.slice(0, 20));
});

test('an invitation link opens the sign-up form with the email filled in', async ({ page }) => {
  await page.goto('/login?mode=signup&email=invited@test.dev');
  await expect(page.getByRole('heading', { name: he.auth.invitedTitle })).toBeVisible();
  await expect(page.getByLabel(he.auth.email)).toHaveValue('invited@test.dev');
});

test('password can be shown and hidden', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel(he.auth.password);
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: he.auth.show }).click();
  await expect(password).toHaveAttribute('type', 'text');
});

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/readings');
  await expect(page).toHaveURL(/\/login/);
});
