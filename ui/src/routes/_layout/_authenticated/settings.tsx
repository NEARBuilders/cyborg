import { createFileRoute } from "@tanstack/react-router";
import { KVEditor } from "../../../components/kv/KVEditor";

export const Route = createFileRoute("/_layout/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your preferences and default values
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <KVEditor />
        </section>
      </div>
    </div>
  );
}
