import { expect, test } from '@playwright/test';
import { he, signIn, signOut, signUp, uniqueEmail } from './helpers';

// One story, step by step: a landlord sets up a property, the renter reports a reading,
// the landlord sees it. The steps share state, so they run in order.
test.describe.configure({ mode: 'serial' });

const landlord = uniqueEmail('landlord');
const renter = uniqueEmail('renter');
const stranger = uniqueEmail('stranger');
const progress = (done: number, total: number) => he.readings.progress.replace('{{done}}', String(done)).replace('{{total}}', String(total));

test('landlord sets up an organization, property, unit, contract and meters', async ({ page }) => {
  await signUp(page, landlord);

  // brand-new users create their organization
  await page.getByPlaceholder(he.home.orgName).fill('E2E Landlord');
  await page.getByRole('button', { name: he.home.createOrg }).click();
  await expect(page.getByRole('heading', { name: 'E2E Landlord' })).toBeVisible();

  // property
  await page.getByRole('button', { name: he.landlord.addProperty }).click();
  await page.getByPlaceholder(he.landlord.propertyName).fill('Dizengoff 10');
  await page.getByRole('button', { name: he.common.save }).click();
  await page.getByRole('link', { name: /Dizengoff 10/ }).click();

  // main (building) water meter
  await page.getByRole('combobox').selectOption('water');
  await page.getByPlaceholder(he.meters.namePlaceholder).fill('Building water');
  await page.getByRole('button', { name: he.meters.add }).click();
  await expect(page.getByText('Building water')).toBeVisible();

  // unit
  await page.getByRole('button', { name: he.landlord.addUnit }).click();
  await page.getByPlaceholder(he.landlord.unitName).fill('Apt 1');
  await page.getByRole('button', { name: he.common.save }).click();
  await page.getByRole('link', { name: /Apt 1/ }).click();

  // contract with a renter
  await page.getByPlaceholder(he.landlord.renterEmails).fill(renter);
  await page.getByRole('button', { name: he.landlord.newContract }).click();
  await expect(page.getByText(renter)).toBeVisible();
  await expect(page.getByText(he.landlord.pending)).toBeVisible();

  // unit electricity meter
  await page.getByRole('combobox').selectOption('electricity');
  await page.getByPlaceholder(he.meters.namePlaceholder).fill('Apt 1 electricity');
  await page.getByRole('button', { name: he.meters.add }).click();
  await expect(page.getByText('Apt 1 electricity')).toBeVisible();
});

test('the renter signs up, sees their rental and reports a reading', async ({ page }) => {
  await signUp(page, renter);
  await expect(page.getByRole('heading', { name: he.renter.title })).toBeVisible();
  await expect(page.getByText(/Dizengoff 10/)).toBeVisible();

  await page.getByRole('link', { name: he.nav.report }).click();
  // the renter only gets the meter of their own unit, not the building water meter
  await expect(page.getByText('Apt 1 electricity')).toBeVisible();
  await expect(page.getByText('Building water')).toHaveCount(0);

  await page.locator('input[type=number]').fill('1250');
  await page.getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(`✓ ${he.readings.submitted}`)).toBeVisible();

  // landlord-only pages bounce a renter back home
  await page.goto('/readings');
  await expect(page).toHaveURL('/');
});

test('the landlord sees the reading, adds the main meter reading and the month is complete', async ({ page }) => {
  await signIn(page, landlord);
  await page.getByRole('link', { name: he.nav.readings }).click();
  await expect(page.getByText(progress(1, 2))).toBeVisible();

  const values = await page.locator('input[type=number]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toContain('1250');

  // the building water meter is the one still empty
  const mainInput = page.locator('form', { hasText: 'Building water' }).locator('input[type=number]');
  await mainInput.fill('480');
  await page.locator('form', { hasText: 'Building water' }).getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(progress(2, 2))).toBeVisible();
});

test('another user cannot see this landlord data', async ({ page }) => {
  await signUp(page, stranger);
  await expect(page.getByText('Dizengoff 10')).toHaveCount(0);
  await expect(page.getByPlaceholder(he.home.orgName)).toBeVisible(); // just a new user with no organization
  await signOut(page);
});
