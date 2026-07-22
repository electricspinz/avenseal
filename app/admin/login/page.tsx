import { Brand } from "@/components/brand";
import { AdminLoginForm } from "@/components/admin-login-form";

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-navy px-5 text-white">
      <section className="w-full max-w-md rounded-lg border border-white/14 bg-white p-8 text-navy shadow-quiet">
        <Brand />
        <h1 className="mt-8 text-3xl font-semibold">Admin Sign In</h1>
        <p className="mt-2 text-sm leading-6 text-slateDeep">
          Supabase authentication is configured through environment variables. Local development uses protected mock screens for workflow verification.
        </p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
