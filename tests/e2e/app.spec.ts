import { expect, test } from "@playwright/test";

test("homepage has approved hero copy and navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Need a Document Notarized Online?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "How It Works" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Pricing" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "FAQ" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Schedule Appointment" }).first()).toBeVisible();
});

test("booking workflow submits and reaches confirmation", async ({ page }, testInfo) => {
  await openFreshBookingFlow(page);
  await page.getByLabel("Full name").fill("Jane Morgan");
  await page.getByLabel("Email").fill("jane@example.com");
  await page.getByLabel("Mobile phone number").fill("(407) 555-0100");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What type of document are you requesting to notarize?" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tell us about witnesses and signer location." })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm identification readiness." })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request an appointment time." })).toBeVisible();
  const available = await findAvailableSlot(page, testInfo.project.name === "mobile" ? 75 : 60);
  await page.getByLabel("Requested appointment date").fill(available.date);
  await expect(page.getByLabel("Requested appointment time")).toContainText(formatSlotLabel(available.slot));
  await expect(page.getByLabel("Requested appointment time")).toBeEnabled();
  await page.getByLabel("Requested appointment time").selectOption(available.slot);
  await expect(page.getByLabel("Requested appointment time")).not.toContainText("9:00 AM");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Administrative notes").fill(`LIVE_VERIFICATION_E2E_TEST_RECORD_${Date.now()}`);
  await page.getByLabel("I agree to the Privacy Policy and Terms.").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Submit Request" }).click();
  await page.waitForURL("**/booking/confirmation", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Thank you. Your request was received." })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Awaiting Review")).toBeVisible();
});

test("booking availability respects Avenseal weekday hours", async ({ page }) => {
  await openFreshBookingFlow(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Enter your full name, email, and mobile phone number.")).toBeVisible();
  await page.getByLabel("Full name").fill("Availability Tester");
  await page.getByLabel("Email").fill("availability@example.com");
  await page.getByLabel("Mobile phone number").fill("(407) 555-0199");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What type of document are you requesting to notarize?" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tell us about witnesses and signer location." })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm identification readiness." })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request an appointment time." })).toBeVisible();

  await page.getByLabel("Requested appointment date").fill("2026-07-18");
  await expect(page.getByText("No booking slots are available for this date.")).toBeVisible();

  await page.getByLabel("Requested appointment date").fill("2026-07-20");
  await expect(page.getByLabel("Requested appointment time")).not.toContainText("9:00 AM");
  await expect(page.getByLabel("Requested appointment time")).not.toContainText("6:00 PM");
});

test("admin can view appointments", async ({ page }) => {
  await createSyntheticAppointment(page);
  await page.goto("/admin/login");
  await loginAdmin(page);
  await page.goto("/admin/appointments");
  await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
  await expect(page.getByText("Awaiting Review").first()).toBeVisible();
});

test("admin settings show Solo mode and Avenseal hours", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdmin(page);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Solo")).toBeChecked();
  await expect(page.getByLabel("Monday opening time")).toHaveValue("09:30");
  await expect(page.getByLabel("Friday closing time")).toHaveValue("18:00");
  await expect(page.getByRole("checkbox", { name: "Saturday" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Sunday" })).not.toBeChecked();

  const description = page.getByLabel("Customer-facing description");
  const original = await description.inputValue();
  await description.fill(`E2E reversible settings check ${Date.now()}`);
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible({ timeout: 15000 });
  await description.fill(original);
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible({ timeout: 15000 });
});

async function openFreshBookingFlow(page: import("@playwright/test").Page) {
  await page.goto("/book");
  await page.evaluate(() => window.localStorage.removeItem("avenseal-booking-draft"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Let's start with your contact information." })).toBeVisible();
}

async function loginAdmin(page: import("@playwright/test").Page) {
  const fs = await import("node:fs");
  const rawEnv = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
  const env = Object.fromEntries(rawEnv.split(/\n/).filter(Boolean).filter((line) => !line.trim().startsWith("#")).map((line) => {
    const idx = line.indexOf("=");
    return [line.slice(0, idx), line.slice(idx + 1).replace(/^['"]|['"]$/g, "")];
  }));
  await page.getByLabel("Email").fill(env.ADMIN_DEMO_EMAIL ?? "admin@avenseal.local");
  await page.getByLabel("Password").fill(env.ADMIN_DEMO_PASSWORD ?? "password");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/admin/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign In" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await page.waitForURL("**/admin");
}

async function createSyntheticAppointment(page: import("@playwright/test").Page) {
  const serviceId = await resolveBookingServiceId(page);
  const available = await findAvailableSlot(page, 90);
  const response = await page.request.post("/api/appointments", {
    data: {
      serviceId,
      fullName: "E2E Admin Fixture",
      email: "e2e-admin-fixture@example.invalid",
      mobilePhone: "000-000-0000",
      documentCategory: "affidavit",
      documentCount: 1,
      signerCount: 1,
      estimatedNotarizations: 1,
      notarizationsNotSure: false,
      hasWitnessLines: false,
      witnessesAvailable: false,
      signerLocation: "Florida",
      allSignersHaveGovernmentId: true,
      preferredDate: available.date,
      preferredTime: available.slot,
      urgency: "not_urgent",
      administrativeNotes: `LIVE_VERIFICATION_E2E_ADMIN_FIXTURE_${Date.now()}`,
      consentAccepted: true,
      privacyPolicyVersion: "e2e",
      termsVersion: "e2e"
    }
  });
  expect(response.ok()).toBeTruthy();
}

async function resolveBookingServiceId(page: import("@playwright/test").Page) {
  const requestPromise = page.waitForRequest((request) =>
    request.url().includes("/api/booking/availability?")
  );
  await page.goto("/book");
  const request = await requestPromise;
  const serviceId = new URL(request.url()).searchParams.get("service");
  expect(serviceId).toMatch(/^[0-9a-f-]{36}$/i);
  return serviceId!;
}

async function findAvailableSlot(page: import("@playwright/test").Page, offsetDays: number) {
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + offsetDays);
  for (let attempts = 0; attempts < 21; attempts += 1) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      const iso = cursor.toISOString().slice(0, 10);
      const response = await page.request.get(`/api/availability?date=${iso}`);
      const body = await response.json();
      if (Array.isArray(body.slots) && body.slots.length > 0) return { date: iso, slot: body.slots[0] as string };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  throw new Error("No available weekday slot found for E2E booking test.");
}

function formatSlotLabel(slot: string) {
  const [hours, minutes] = slot.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
