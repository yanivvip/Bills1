import fs from 'node:fs';
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
  await page.getByRole('combobox').nth(1).selectOption('water');
  await page.getByPlaceholder(he.meters.namePlaceholder).fill('Building water');
  await page.getByRole('button', { name: he.meters.add }).click();
  await expect(page.getByText('Building water')).toBeVisible();

  // unit
  await page.getByRole('button', { name: he.landlord.addUnit }).click();
  await page.getByPlaceholder(he.landlord.unitName).fill('Apt 1');
  await page.locator('form').filter({ has: page.getByPlaceholder(he.landlord.unitName) }).getByRole('button', { name: he.common.save }).click();

  // unit electricity meter (meters are managed on the property page only)
  await page.getByRole('combobox').nth(0).selectOption({ label: 'Apt 1' });
  await page.getByRole('combobox').nth(1).selectOption('electricity');
  await page.getByPlaceholder(he.meters.namePlaceholder).fill('Apt 1 electricity');
  await page.getByRole('button', { name: he.meters.add }).click();
  await expect(page.getByText('Apt 1 electricity')).toBeVisible();

  // contract with a renter
  await page.getByRole('link', { name: /Apt 1/ }).click();
  await page.getByPlaceholder(he.landlord.renterEmails).fill(renter);
  await page.getByRole('button', { name: he.landlord.newContract }).click();
  await expect(page.getByText(renter)).toBeVisible();
  await expect(page.getByText(he.landlord.pending)).toBeVisible();
  // the unit page has no meter form
  await expect(page.getByPlaceholder(he.meters.namePlaceholder)).toHaveCount(0);
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
  await page.locator('input[type=date]').fill('2026-10-02'); // the renter chooses the date the meter was read
  await page.getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(`✓ ${he.readings.submitted}`)).toBeVisible();
  await page.reload();
  await expect(page.locator('input[type=date]')).toHaveValue('2026-10-02');

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

test('the landlord sets tariffs, approves the month and marks it paid', async ({ page }) => {
  await signIn(page, landlord);

  // the opening (previous month) reading of the unit meter
  await page.getByRole('link', { name: he.nav.readings }).click();
  await page.getByLabel('previous month').click();
  const meterForm = page.locator('form', { hasText: 'Apt 1 electricity' });
  await meterForm.locator('input[type=number]').fill('1000');
  await meterForm.getByRole('button', { name: he.common.save }).click();
  await expect(meterForm.getByText(`✓ ${he.readings.submitted}`)).toBeVisible();

  // tariffs on the property page
  await page.goto('/');
  await page.getByRole('link', { name: /Dizengoff 10/ }).click();
  await page.getByLabel(he.tariff.electricityRate, { exact: true }).fill('0.64');
  await page.getByLabel(he.tariff.electricityFixed, { exact: true }).fill('90');
  await page.getByLabel(he.tariff.waterA, { exact: true }).fill('4.543');
  await page.getByLabel(he.tariff.waterB, { exact: true }).fill('11.658');
  await page.locator('form', { hasText: he.tariff.title }).getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(`✓ ${he.tariff.saved}`)).toBeVisible();

  // billing settings of the unit
  await page.getByRole('link', { name: /Apt 1/ }).click();
  await page.getByLabel(he.unitBilling.communityFee).fill('150');
  await page.locator('form', { hasText: he.unitBilling.title }).getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(`✓ ${he.tariff.saved}`)).toBeVisible();

  // preview: 250 kWh * 0.64 = 160 + fixed 90 + community 150 = 400
  await page.getByRole('link', { name: he.nav.bills }).click();
  await expect(page.getByText('₪400.00')).toBeVisible();

  // a one-off charge changes the total
  await page.getByPlaceholder(he.bills.chargeDescription).fill('Repair');
  await page.getByLabel(he.bills.chargeAmount).fill('25.5');
  await page.getByRole('button', { name: he.bills.addCharge }).click();
  await expect(page.getByText('₪425.50')).toBeVisible();

  // approve, then mark paid
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: he.bills.approve }).click();
  await expect(page.getByText(`✓ ${he.bills.approved}`)).toBeVisible();
  await page.getByRole('button', { name: he.bills.markPaid }).click();
  await expect(page.getByText(/שולם ב-/)).toBeVisible();

  // the annual report shows the month and exports to CSV and Excel
  await page.getByRole('link', { name: he.nav.reports }).click();
  await expect(page.getByText('₪425.50').first()).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: he.report.exportCsv }).click()]);
  expect(csv.suggestedFilename()).toMatch(/.csv$/);
  const text = fs.readFileSync((await csv.path())!, 'utf8');
  expect(text).toContain('Apt 1');
  expect(text).toContain('425.5');
  expect(text).toContain('1000'); // previous meter reading
  expect(text).toContain('1250'); // current meter reading
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: he.report.exportExcel }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/.xlsx$/);
  expect(fs.statSync((await xlsx.path())!).size).toBeGreaterThan(2000);
});

test('the renter sees the approved bill and that it is paid', async ({ page }) => {
  await signIn(page, renter);
  await page.getByRole('link', { name: he.nav.myBill }).click();
  await expect(page.getByText('₪425.50').first()).toBeVisible();
  await expect(page.getByText(`✓ ${he.bills.paid}`)).toBeVisible();
});

test('another user cannot see this landlord data', async ({ page }) => {
  await signUp(page, stranger);
  await expect(page.getByText('Dizengoff 10')).toHaveCount(0);
  await expect(page.getByPlaceholder(he.home.orgName)).toBeVisible(); // just a new user with no organization
  await signOut(page);
});
