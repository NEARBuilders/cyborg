import { createFileRoute } from "@tanstack/react-router";
import { KVEditor } from "../../../components/kv/kv-editor";

export const Route = createFileRoute("/_layout/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-primary mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground/70">
          Manage your preferences
        </p>
      </div>

      <div className="space-y-4">
        <section>
          <KVEditor />
        </section>
      </div>
    </div>
  );
}
