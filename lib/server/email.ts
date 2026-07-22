import { getSmtpConfig } from "@/lib/env";

export type EmailDeliveryResult = {
  status: "sent" | "failed" | "skipped";
  providerMessageId: string | null;
  error: string | null;
};

type SmtpConfig = {
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

type SmtpTransport = {
  sendMail(input: { from: string; to: string; subject: string; html: string }): Promise<{ messageId?: string }>;
};

type SmtpTransportFactory = (config: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}) => SmtpTransport;

function readSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  return getSmtpConfig(env);
}

async function loadNodemailerTransportFactory(): Promise<SmtpTransportFactory> {
  const nodemailer = await import("nodemailer") as {
    default?: { createTransport: SmtpTransportFactory };
    createTransport?: SmtpTransportFactory;
  };
  const createTransport = nodemailer.default?.createTransport ?? nodemailer.createTransport;
  if (!createTransport) throw new Error("Nodemailer could not initialize an SMTP transport.");
  return createTransport;
}

export async function sendEmailIfConfigured(
  input: { to: string; subject: string; html: string },
  options: { env?: NodeJS.ProcessEnv; createTransport?: SmtpTransportFactory } = {}
): Promise<EmailDeliveryResult> {
  const config = readSmtpConfig(options.env);
  if (!config) {
    console.info("[email] SMTP delivery skipped: configuration is incomplete.");
    return { status: "skipped", providerMessageId: null, error: "Email delivery is not configured." };
  }

  try {
    const createTransport = options.createTransport ?? await loadNodemailerTransportFactory();
    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password }
    });
    const response = await transport.sendMail({ from: config.from, to: input.to, subject: input.subject, html: input.html });
    console.info("[email] SMTP accepted message.", { recipient: input.to, messageId: response.messageId });
    return { status: "sent", providerMessageId: response.messageId ?? null, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP delivery failed.";
    console.error("[email] SMTP delivery failed.", { recipient: input.to, error: message });
    return { status: "failed", providerMessageId: null, error: message };
  }
}
