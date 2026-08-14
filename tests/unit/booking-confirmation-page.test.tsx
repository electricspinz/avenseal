import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/public-shell", () => ({ PublicShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/brand", () => ({ Brand: () => null }));
vi.mock("@/components/button", async () => {
  const { createElement } = await vi.importActual<typeof import("react")>("react");
  return { ButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => createElement("a", { href }, children) };
});
vi.mock("@/components/icons", () => ({ icons: { check: () => null } }));
vi.mock("next/link", async () => {
  const { createElement } = await vi.importActual<typeof import("react")>("react");
  return { default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement("a", { href }, children) };
});
import ConfirmationPage from "@/app/booking/confirmation/page";

describe("booking confirmation payment return copy", () => {
  it("does not treat payment=success as proof of a confirmed payment", async () => {
    render(await ConfirmationPage({ searchParams: Promise.resolve({ payment: "success" }) }));

    expect(screen.getByRole("heading", { name: "We’re confirming your payment." })).toBeTruthy();
    expect(screen.getByText(/being confirmed securely/i)).toBeTruthy();
    expect(screen.queryByText(/payment has been confirmed/i)).toBeNull();
  });

  it("states that a cancelled checkout did not confirm a payment", async () => {
    render(await ConfirmationPage({ searchParams: Promise.resolve({ payment: "cancelled" }) }));

    expect(screen.getByRole("heading", { name: "Checkout was cancelled." })).toBeTruthy();
    expect(screen.getByText(/No payment was confirmed/i)).toBeTruthy();
  });

  it("preserves the normal booking confirmation when no payment return is present", async () => {
    render(await ConfirmationPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Thank you. Your request was received." })).toBeTruthy();
    expect(screen.getByText("Check your email to open your appointment.")).toBeTruthy();
    expect(screen.getByText(/secure Client Workspace link has been sent/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Request a New Secure Link" }).getAttribute("href")).toBe("/appointments/access/request");
    expect(screen.queryByRole("link", { name: "Check Appointment Status" })).toBeNull();
  });
});
