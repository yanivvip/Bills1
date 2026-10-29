import { expect, type Page } from '@playwright/test';
import he from '../src/i18n/he.json' with { type: 'json' };

export { he };

const run = Date.now().toString(36);
let counter = 0;
export const uniqueEmail = (who: string) => `e2e-${run}-${counter++}-${who}@test.dev`;
export const PASSWORD = 'test-password-123';

export async function signUp(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: he.auth.toSignUp }).click();
  await page.getByLabel(he.auth.email).fill(email);
  await page.getByLabel(he.auth.password).fill(PASSWORD);
  await page.getByRole('button', { name: he.auth.signUp, exact: true }).click();
  await expect(page).toHaveURL('/');
}

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(he.auth.email).fill(email);
  await page.getByLabel(he.auth.password).fill(PASSWORD);
  await page.getByRole('button', { name: he.auth.signIn, exact: true }).click();
  await expect(page).toHaveURL('/');
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: he.auth.signOut }).click();
  await expect(page).toHaveURL(/\/login/);
}
