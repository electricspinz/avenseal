"use client";

import { useState } from "react";
import { Button } from "@/components/button";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      setError("Invalid admin credentials.");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") ?? "/admin";
    window.location.assign(next);
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-semibold">
        Email
        <input className="mt-2 min-h-11 w-full rounded-md border border-silver px-3" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="block text-sm font-semibold">
        Password
        <input type="password" className="mt-2 min-h-11 w-full rounded-md border border-silver px-3" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <Button className="w-full" type="submit">Sign In</Button>
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
    </form>
  );
}
