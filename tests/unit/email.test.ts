import { describe, expect, it, vi } from "vitest";
import { sendEmailIfConfigured } from "@/lib/server/email";

const smtpEnv = {
  NODE_ENV: "test",
  EMAIL_FROM: "Avenseal Appointments <appointments@avenseal.com>",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "appointments@avenseal.com",
  SMTP_PASSWORD: "google-app-password"
} satisfies NodeJS.ProcessEnv;

describe("Gmail SMTP delivery", () => {
  it("returns sent when Gmail accepts the message", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "gmail-message-id" });
    const createTransport = vi.fn().mockReturnValue({ sendMail });

    const delivery = await sendEmailIfConfigured(
      { to: "customer@example.com", subject: "Payment required", html: "<p>Pay now</p>" },
      { env: smtpEnv, createTransport }
    );

    expect(delivery).toEqual({ status: "sent", providerMessageId: "gmail-message-id", error: null });
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "appointments@avenseal.com", pass: "google-app-password" }
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: smtpEnv.EMAIL_FROM, to: "customer@example.com" }));
  });

  it("returns failed when SMTP rejects the message", async () => {
    const delivery = await sendEmailIfConfigured(
      { to: "customer@example.com", subject: "Payment required", html: "<p>Pay now</p>" },
      { env: smtpEnv, createTransport: () => ({ sendMail: vi.fn().mockRejectedValue(new Error("SMTP rejected message")) }) }
    );

    expect(delivery).toEqual({ status: "failed", providerMessageId: null, error: "SMTP rejected message" });
  });

  it("returns skipped when SMTP configuration is missing", async () => {
    const delivery = await sendEmailIfConfigured(
      { to: "customer@example.com", subject: "Payment required", html: "<p>Pay now</p>" },
      { env: { NODE_ENV: "test", EMAIL_FROM: smtpEnv.EMAIL_FROM } }
    );

    expect(delivery).toEqual({ status: "skipped", providerMessageId: null, error: "Email delivery is not configured." });
  });
});
