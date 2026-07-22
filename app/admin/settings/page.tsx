import { AdminShell } from "@/components/admin-shell";
import { AdminSettingsForm } from "@/components/admin-settings-form";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await repository.getOrganizationSettings();
  return (
    <AdminShell active="Settings">
      <h1 className="text-3xl font-semibold text-navy">Settings</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slateDeep">
        Organization configuration controls Avenseal’s current Solo operation while preserving the future NotaryOS tenant model.
      </p>
      <div className="mt-6">
        <AdminSettingsForm settings={settings} />
      </div>
    </AdminShell>
  );
}
