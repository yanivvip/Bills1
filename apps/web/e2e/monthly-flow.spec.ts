import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { he, signIn, signOut, signUp, uniqueEmail } from './helpers';

// One story, step by step: a landlord sets up a property, the renter reports a reading,
// the landlord sees it. The steps share state, so they run in order.
test.describe.configure({ mode: 'serial' });

const landlord = uniqueEmail('landlord');
const renter = uniqueEmail('renter');
const stranger = uniqueEmail('stranger');
const newRenter = uniqueEmail('newrenter');
const wizardLandlord = uniqueEmail('wizard');
const wizardRenter = uniqueEmail('wizardrenter');
const progress = (done: number, total: number) => he.readings.progress.replace('{{done}}', String(done)).replace('{{total}}', String(total));

test('landlord sets up an organization, property, unit, contract and meters', async ({ page }) => {
  await signUp(page, landlord);

  // brand-new users create their organization
  await page.getByPlaceholder(he.home.orgName).fill('E2E Landlord');
  await page.getByRole('button', { name: he.home.createOrg }).click();
  await expect(page.getByText(/E2E Landlord/)).toBeVisible();

  // property (added in the Property tab)
  await page.getByRole('link', { name: he.nav.property, exact: true }).click();
  await page.getByRole('button', { name: he.landlord.addProperty }).click();
  await page.getByPlaceholder(he.landlord.propertyName).fill('Dizengoff 10');
  await page.getByRole('button', { name: he.common.save }).click();
  await page.getByRole('link', { name: he.landlord.tariffsAndMeters }).click();

  // main (building) water meter
  const meterForm = page.locator('form').filter({ has: page.getByPlaceholder(he.meters.namePlaceholder) });
  await meterForm.getByRole('combobox').nth(1).selectOption('water');
  await page.getByPlaceholder(he.meters.namePlaceholder).fill('Building water');
  await page.getByRole('button', { name: he.meters.add }).click();
  await expect(page.getByText('Building water')).toBeVisible();

  // unit
  await page.getByRole('button', { name: he.landlord.addUnit }).click();
  await page.getByPlaceholder(he.landlord.unitName).fill('Apt 1');
  await page.locator('form').filter({ has: page.getByPlaceholder(he.landlord.unitName) }).getByRole('button', { name: he.common.save }).click();

  // unit electricity meter (meters are managed on the property page only)
  await meterForm.getByRole('combobox').nth(0).selectOption({ label: 'Apt 1' });
  await meterForm.getByRole('combobox').nth(1).selectOption('electricity');
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

  // the home page warns that the renter has not reported yet
  await page.goto('/');
  await expect(page.getByRole('region', { name: he.attention.title })).toContainText('Apt 1');
});

test('the renter signs up, sees their rental and reports a reading', async ({ page }) => {
  await signUp(page, renter);
  await expect(page.getByText(/Apt 1/).first()).toBeVisible();
  await expect(page.getByText(/Dizengoff 10/).first()).toBeVisible();
  await expect(page.getByText(he.renterHome.timeToReport)).toBeVisible(); // nothing reported yet this month

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
  await page.getByRole('tab', { name: /Apt 1/ }).click();

  const values = await page.locator('input[type=number]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toContain('1250');

  await page.getByRole('tab', { name: new RegExp(he.meters.main) }).click();
  // the building water meter is the one still empty
  const mainInput = page.locator('form', { hasText: 'Building water' }).locator('input[type=number]');
  await mainInput.fill('480');
  await page.locator('form', { hasText: 'Building water' }).getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(progress(2, 2))).toBeVisible();

  // everything reported: the home page has nothing to warn about
  await page.goto('/');
  await expect(page.getByText(`✓ ${he.attention.allClear}`)).toBeVisible();
});

test('the landlord sets tariffs, approves the month and marks it paid', async ({ page }) => {
  await signIn(page, landlord);

  // the opening (previous month) reading of the unit meter
  await page.getByRole('link', { name: he.nav.readings }).click();
  await page.getByRole('tab', { name: /Apt 1/ }).click();
  await page.getByLabel('previous month').click();
  const meterForm = page.locator('form', { hasText: 'Apt 1 electricity' });
  await meterForm.locator('input[type=number]').fill('1000');
  await meterForm.getByRole('button', { name: he.common.save }).click();
  await expect(meterForm.getByText(`✓ ${he.readings.submitted}`)).toBeVisible();

  // tariffs on the property page
  await page.getByRole('link', { name: he.nav.property, exact: true }).click();
  await page.getByRole('link', { name: he.landlord.tariffsAndMeters }).click();
  await page.getByLabel(he.tariff.electricityRate, { exact: true }).fill('0.64');
  await page.getByLabel(he.tariff.electricityFixed, { exact: true }).fill('90');
  await page.getByLabel(he.tariff.waterA, { exact: true }).fill('4.543');
  await page.getByLabel(he.tariff.waterB, { exact: true }).fill('11.658');
  // property tax every two months, last due last month: this month is not a property-tax month, so nothing is added
  const lastMonth = new Date();
  lastMonth.setDate(1);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const anchor = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  const tariffForm = page.locator('form', { hasText: he.tariff.title });
  await expect(page.getByLabel(he.tariff.propertyTaxAnchor)).toHaveCount(0);
  // meter layout: the extra choice follows the layout; this unit has its own electricity meter, so 'separate' bills the same
  await page.getByLabel(he.layout.water).selectOption('shared');
  await expect(page.getByLabel(he.layout.splitLabel)).toBeVisible();
  await page.getByLabel(he.layout.water).selectOption('main_sub');
  await expect(page.getByLabel(he.layout.splitLabel)).toHaveCount(0);
  await expect(page.getByLabel(he.layout.differenceLabel).first()).toBeVisible();
  await page.getByLabel(he.layout.electricity).selectOption('separate');
  await page.getByLabel(he.tariff.propertyTaxEvery).selectOption('2');
  await expect(tariffForm.getByRole('button', { name: he.common.save })).toBeDisabled(); // needs a property-tax month
  await page.getByLabel(he.tariff.propertyTaxAnchor).fill(anchor);
  await page.getByLabel(he.tariff.sewageRate).fill('6.5');
  await tariffForm.getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(`✓ ${he.tariff.saved}`)).toBeVisible();

  // billing settings of the unit
  await page.getByRole('link', { name: /Apt 1/ }).click();
  await page.getByLabel(he.unitBilling.communityFee).fill('150');
  await page.getByLabel(he.unitBilling.propertyTax).fill('100');
  await page.locator('form', { hasText: he.unitBilling.title }).getByRole('button', { name: he.common.save }).click();
  await expect(page.getByText(`✓ ${he.tariff.saved}`)).toBeVisible();

  // preview: 250 kWh * 0.64 = 160 + fixed 90 + community 150 = 400
  await page.getByRole('link', { name: he.nav.bills }).click();
  await expect(page.getByText('₪400.00')).toBeVisible();

  // a one-off charge changes the total
  await page.getByRole('button', { name: he.bills.newCharge }).click();
  await page.getByPlaceholder(he.bills.chargeDescription).fill('Repair');
  await page.getByLabel(he.bills.chargeAmount).fill('25.5');
  await page.getByRole('button', { name: he.bills.chargeRecurring }).click();
  await page.getByRole('button', { name: he.bills.addCharge }).click();
  await expect(page.getByText('₪425.50')).toBeVisible();
  await expect(page.getByText(/↻ Repair/)).toBeVisible();
  await expect(page.getByLabel(`${he.bills.sewageQty} Apt 1`)).toHaveCount(0); // not a property-tax month

  // approve, then mark paid
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: he.bills.approve }).click();
  await expect(page.getByText(`✓ ${he.bills.approved}`)).toBeVisible();
  // supplier reconciliation: billed to the renter 160 + 90 = 250, the supplier charged 300
  await page.getByLabel(`${he.bills.supplierAmount} ${he.meters.electricity}`).fill('300');
  await page.getByRole('button', { name: he.common.save }).first().click();
  await expect(page.getByText(/שילמת.*50.00/)).toBeVisible();

  // a partial payment first, then the rest
  await page.getByRole('button', { name: he.bills.markPaidAction }).click();
  await page.getByLabel(he.bills.paymentAmount, { exact: true }).fill('100');
  await page.getByRole('button', { name: he.bills.markPaid }).click();
  await expect(page.getByText(he.bills.partlyPaid)).toBeVisible();
  await expect(page.getByText(/325.50/)).toBeVisible(); // the remaining balance: 425.50 - 100
  await page.getByRole('button', { name: he.bills.markPaid }).click();
  await expect(page.getByText(/שולם ב-/)).toBeVisible();

  // the month strip marks the month as paid with a symbol, and the printable page is now a receipt
  await expect(page.locator('button[aria-current="date"]')).toContainText('✓');
  await page.getByRole('link', { name: he.bills.sendToRenter }).click();
  await expect(page.getByRole('heading', { name: he.bills.sendToRenter })).toBeVisible();
  await page.getByRole('button', { name: he.whatsapp.edit }).click();
  await page.getByLabel(he.whatsapp.title).fill('Hello Dana, edited');
  await expect(page.getByRole('link', { name: he.whatsapp.open })).toHaveAttribute('href', /wa.me.*Hello%20Dana%2C%20edited/);
  // the printable page is a receipt now that the bill is paid
  await page.getByRole('link', { name: he.bills.viewBill }).click();
  await expect(page.getByRole('heading', { name: he.bills.receipt })).toBeVisible();

  // the annual report shows the month and exports to CSV and Excel
  await page.getByRole('link', { name: he.nav.property, exact: true }).click();
  await page.getByRole('link', { name: he.nav.reports }).click();
  await expect(page.getByText('₪425.50').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: he.report.collections })).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: he.report.exportCsv }).click()]);
  expect(csv.suggestedFilename()).toMatch(/.csv$/);
  const text = fs.readFileSync((await csv.path())!, 'utf8');
  expect(text).toContain('Apt 1');
  expect(text).toContain('425.5');
  expect(text).toContain('1000'); // previous meter reading
  expect(text).toContain('1250'); // current meter reading
  expect(text).toContain(he.report.collections);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: he.report.exportExcel }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/.xlsx$/);
  expect(fs.statSync((await xlsx.path())!).size).toBeGreaterThan(2000);
});

test('the renter sees the approved bill and that it is paid', async ({ page }) => {
  await signIn(page, renter);
  await page.getByRole('link', { name: he.nav.myBill }).click();
  await expect(page.getByText('₪425.50').first()).toBeVisible();
  await expect(page.getByText(`✓ ${he.bills.paid}`).first()).toBeVisible();
  await expect(page.getByRole('button', { name: he.bills.iPaid })).toHaveCount(0); // already paid
  await page.getByText(he.bills.howCalculated).click();
  await expect(page.getByText(/250/).first()).toBeVisible(); // the explanation names the 250 kWh
  await page.getByRole('link', { name: he.bills.viewBill }).click();
  await expect(page.getByRole('heading', { name: he.bills.receipt })).toBeVisible();
});

test('the landlord sees the consumption history and the alerts centre', async ({ page }) => {
  await signIn(page, landlord);

  // home: this month's readings and the latest bills
  await expect(page.getByText(he.landlordHome.readings)).toBeVisible();
  await expect(page.getByText(he.landlordHome.lastBills)).toBeVisible();

  // history: the unit used 250 kWh this month (1000 -> 1250) and paid 425.50
  await page.getByRole('link', { name: he.nav.history }).click();
  await expect(page.getByRole('heading', { name: he.history.title })).toBeVisible();
  const chart = page.getByRole('img', { name: he.history.last6 });
  await expect(chart).toContainText('250');
  await page.getByRole('button', { name: 'Apt 1' }).click();
  await expect(chart).toContainText('250');
  await page.getByRole('button', { name: he.history.cost }).click();
  await expect(chart).toContainText('425.50');

  // alerts: the renter reported this month; reading them moves the alert to "earlier" and clears the bell's count
  await page.getByRole('link', { name: he.alerts.title }).click();
  await expect(page.getByRole('heading', { name: he.alerts.title })).toBeVisible();
  await expect(page.getByText(he.alerts.reported.title)).toBeVisible();
  await page.getByRole('button', { name: he.alerts.markAllRead }).click();
  await expect(page.getByText(he.alerts.earlier)).toBeVisible();
  await expect(page.getByRole('button', { name: he.alerts.markAllRead })).toHaveCount(0);
});

test('the landlord replaces the tenant; the old renter keeps the bills but cannot report', async ({ page }) => {
  await signIn(page, landlord);
  await page.getByRole('link', { name: he.nav.property, exact: true }).click();
  await page.getByRole('link', { name: he.landlord.tariffsAndMeters }).click();
  await page.getByRole('link', { name: /Apt 1/ }).click();
  await page.getByRole('button', { name: he.replace.button }).click();

  // the outgoing tenant's account is finished: readings in, month approved, bill paid
  await expect(page.getByText(`✓ ${he.replace.closingReadings}`)).toBeVisible();
  await expect(page.getByText(`✓ ${he.replace.monthApproved}`)).toBeVisible();
  await expect(page.getByText(`✓ ${he.replace.allPaid}`)).toBeVisible();

  await page.getByLabel(he.replace.newRenters).fill(newRenter);
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: he.replace.submit }).click();
  await expect(page.getByText(newRenter)).toBeVisible();
  await expect(page.getByText(he.landlord.pending)).toBeVisible();
});

test('the outgoing renter still sees the old bill but has no meters to report', async ({ page }) => {
  await signIn(page, renter);
  await page.goto('/report');
  await expect(page.getByText(he.readings.renterNoMeters)).toBeVisible();
  await page.goto('/my-bill');
  await expect(page.getByText('₪425.50').first()).toBeVisible();
});

test('another user cannot see this landlord data', async ({ page }) => {
  await signUp(page, stranger);
  await expect(page.getByText('Dizengoff 10')).toHaveCount(0);
  await expect(page.getByPlaceholder(he.home.orgName)).toBeVisible(); // just a new user with no organization
  await signOut(page);
});

test('a new landlord sets up a whole property in one scroll', async ({ page }) => {
  await signUp(page, wizardLandlord);
  await page.getByPlaceholder(he.home.orgName).fill('Wizard Landlord');
  await page.getByRole('button', { name: he.home.createOrg }).click();
  await expect(page.getByText(/Wizard Landlord/)).toBeVisible();

  // the home page invites to set up the first property
  await page.getByRole('link', { name: he.landlordHome.firstProperty }).click();
  await expect(page.getByRole('heading', { name: he.onboarding.title })).toBeVisible();

  // nothing is allowed until the property and the unit have names
  const finish = page.getByRole('button', { name: he.onboarding.finish });
  await expect(finish).toBeDisabled();
  await page.getByLabel(he.onboarding.propertyName).fill('Wizard 5');
  await page.getByLabel(he.onboarding.unitName).fill('Apt W');
  await expect(finish).toBeEnabled();

  // the owner lives in the main house; the unit has a renter
  await page.getByRole('radio', { name: he.onboarding.livesHere }).click();
  await page.getByLabel(he.landlord.renterEmails).fill(wizardRenter);
  await page.getByLabel(he.onboarding.renterPhone).fill('050-1234567');
  await page.getByLabel(he.tariff.electricityRate, { exact: true }).fill('0.64');
  await page.getByLabel(he.tariff.electricityFixed, { exact: true }).fill('90');
  await finish.click();

  // we land on the new property with its units and tariffs saved
  await expect(page.getByRole('heading', { name: 'Wizard 5' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Apt W/ })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(he.onboarding.mainHouse) })).toBeVisible();
  await expect(page.getByLabel(he.tariff.electricityRate, { exact: true })).toHaveValue('0.64');
  await expect(page.getByLabel(he.tariff.electricityFixed, { exact: true })).toHaveValue('90');
});

test('a renter phone entered in the wizard shows on the unit page and can be changed', async ({ page }) => {
  await signIn(page, wizardLandlord);
  await page.getByRole('link', { name: he.nav.property, exact: true }).click();
  await page.getByRole('link', { name: he.landlord.tariffsAndMeters }).click();
  await page.getByRole('link', { name: /Apt W/ }).click();
  const phone = page.getByLabel(he.landlord.phone);
  await expect(phone).toHaveValue('050-1234567');
  await phone.fill('052-7654321');
  await Promise.all([page.waitForResponse((r) => r.url().includes('contract_renters') && r.request().method() === 'PATCH'), phone.blur()]);
  await page.reload();
  await expect(page.getByLabel(he.landlord.phone)).toHaveValue('052-7654321');
});

test('the header switches between properties and the pages follow', async ({ page }) => {
  await signIn(page, wizardLandlord);
  await page.getByRole('link', { name: he.nav.property, exact: true }).click();
  await page.getByRole('button', { name: he.landlord.addProperty }).click();
  await page.getByPlaceholder(he.landlord.propertyName).fill('Second 7');
  await page.getByRole('button', { name: he.common.save }).click();

  const switcher = page.getByLabel(he.landlord.properties);
  await expect(switcher).toBeVisible();
  await switcher.selectOption({ label: 'Second 7' });

  // the new property has no meters yet; the first one has
  await page.getByRole('link', { name: he.nav.readings }).click();
  await expect(page.getByText(he.readings.noMeters)).toBeVisible();
  await switcher.selectOption({ label: 'Wizard 5' });
  await expect(page.getByText(he.readings.noMeters)).toHaveCount(0);
});

test('fixed charges are edited beside the readings and the home reminder opens the renter chat', async ({ page }) => {
  await signIn(page, wizardLandlord);
  await page.getByRole('link', { name: he.nav.readings }).click();
  const electricity = page.getByLabel(`${he.readings.fixedTitle} – ${he.meters.electricity}`);
  await expect(electricity).toHaveValue('90');
  await electricity.fill('95');
  await page.getByRole('button', { name: he.common.save }).first().click();
  await expect(page.getByText(he.readings.fixedSaved)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(`${he.readings.fixedTitle} – ${he.meters.electricity}`)).toHaveValue('95');

  await page.getByRole('link', { name: he.nav.home, exact: true }).click();
  await expect(page.getByRole('link', { name: he.landlordHome.sendReminder }).first()).toHaveAttribute('href', /wa\.me\/972527654321/);
});

test('a photo of the meter is kept next to the reading and can be viewed', async ({ page }) => {
  await signIn(page, wizardLandlord);
  await page.getByRole('link', { name: he.nav.readings }).click();
  await page.getByRole('tab', { name: /Apt W/ }).click();
  const card = page.locator('form', { hasText: 'Apt W' }).first();

  // a picture taken with the camera (here drawn in the page), shrunk and shown as a thumbnail
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 900;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 1600, 900);
    x.fillStyle = '#000';
    x.font = '300px sans-serif';
    x.fillText('01234', 100, 500);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg'));
    let s = '';
    new Uint8Array(await blob.arrayBuffer()).forEach((v) => (s += String.fromCharCode(v)));
    return btoa(s);
  });
  await card.getByLabel(he.readings.photo).setInputFiles({ name: 'meter.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  await expect(card.getByAltText(he.readings.photoTaken)).toBeVisible();

  await card.locator('input[type=number]').fill('1100');
  await card.getByRole('button', { name: he.common.save }).click();
  await expect(card.getByText(`✓ ${he.readings.submitted}`)).toBeVisible();

  // after a reload the picture is still there, in the private bucket, behind a short-lived link
  await page.reload();
  await page.getByRole('tab', { name: /Apt W/ }).click();
  await page.locator('form', { hasText: 'Apt W' }).first().getByRole('button', { name: he.readings.viewPhoto }).click();
  const shown = page.getByRole('dialog').locator('img');
  await expect(shown).toBeVisible();
  await expect.poll(() => shown.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: he.common.close }).click();
});
