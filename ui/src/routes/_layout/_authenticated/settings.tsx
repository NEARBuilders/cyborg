import { createFileRoute } from "@tanstack/react-router";
import { KVEditor } from "@/components/kv/kv-editor";
import { PaymentKeysSettings } from "@/components/payment-keys/payment-keys-settings";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_layout/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="w-full max-w-4xl px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account preferences and tools
        </p>
      </div>

      <div className="space-y-8">
        <section className="w-full">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Payment Keys</h2>
            <p className="text-sm text-muted-foreground">
              Optional instant transactions without wallet popups
            </p>
          </div>
          <PaymentKeysSettings />
        </section>

        <Separator />

        <section className="w-full">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Key-Value Storage</h2>
            <p className="text-sm text-muted-foreground">
              Store and manage your application data
            </p>
          </div>
          <KVEditor />
        </section>
      </div>
    </div>
  );
}
