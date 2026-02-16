import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  Key,
  Copy,
  Plus,
  DollarSign,
  Trash2,
  Info,
  AlertTriangle,
  X,
  Download,
} from "lucide-react";
import {
  usePaymentKeys,
  useCreatePaymentKey,
  useTopUpPaymentKey,
  useDeletePaymentKey,
  useImportPaymentKey,
} from "@/hooks/usePaymentKeys";
import { Badge } from "@/components/ui/badge";
import type { PaymentKey } from "@/hooks/usePaymentKeys";

export function PaymentKeysSettings() {
  const {
    data: status,
    isLoading: isLoadingStatus,
    refetch,
  } = usePaymentKeys();
  const createKey = useCreatePaymentKey();
  const topUp = useTopUpPaymentKey();
  const deleteKey = useDeletePaymentKey();
  const importKey = useImportPaymentKey();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [initialDeposit, setInitialDeposit] = useState("1");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKeyCopied, setShowKeyCopied] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState("");
  const [importKeyBalance, setImportKeyBalance] = useState("");

  const handleCreateKey = async () => {
    try {
      const deposit = parseFloat(initialDeposit);
      if (isNaN(deposit) || deposit < 1) {
        toast.error("Minimum deposit is $1 USD");
        return;
      }

      // Check if there are already incomplete keys
      const incompleteKeys = keys.filter((k) => k.isActive && k.isIncomplete);
      if (incompleteKeys.length > 0) {
        toast.error(
          `You have ${incompleteKeys.length} incomplete payment key(s). Please complete or delete them before creating a new one.`,
        );
        return;
      }

      const result = await createKey.mutateAsync(initialDeposit);

      if (result.transactions && result.transactions.length === 2) {
        const { authClient } = await import("@/lib/auth-client");
        const nearAuth = authClient.near;
        if (!nearAuth) {
          toast.error("NEAR wallet not connected");
          return;
        }

        const walletAccountId = nearAuth.getAccountId();
        if (!walletAccountId) {
          toast.error("No wallet connected");
          return;
        }

        const near = nearAuth.getNearClient();

        // Transaction 1: Store encrypted payment key
        await near
          .transaction(walletAccountId)
          .functionCall(
            result.transactions[0].contractId,
            result.transactions[0].methodName,
            result.transactions[0].args,
            {
              gas: result.transactions[0].gas,
              attachedDeposit: result.transactions[0].deposit,
            },
          )
          .send();

        // Store the payment key in our database after first transaction succeeds
        const storeResponse = await fetch("/api/payment-keys/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            nonce: result.nonce,
            secret: result.secret,
            initialBalance: "0",
          }),
        });

        if (!storeResponse.ok) {
          const errorData = await storeResponse
            .json()
            .catch(() => ({ error: "Failed to store payment key" }));
          throw new Error(errorData.error || "Failed to store payment key");
        }

        // Show the payment key to user
        setCreatedKey(result.paymentKey);
        setShowCreateDialog(false);

        toast.success(
          "Payment key created! Click 'Complete Setup' to fund it.",
          {
            duration: 10000,
          },
        );

        refetch();

        // Note: Second transaction (funding) must be triggered by user action
        // to avoid browser popup blocking
        console.log(
          "First transaction complete. User needs to click 'Complete Setup' for funding.",
        );
      }
    } catch (error) {
      console.error("Error creating payment key:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Failed to create payment key";
      toast.error(errorMessage, {
        duration: 10000,
      });
    }
  };

  const handleDelete = async (keyId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this payment key? Any remaining funds cannot be recovered.",
      )
    ) {
      return;
    }

    try {
      await deleteKey.mutateAsync(keyId);
    } catch (error) {
      console.error("Error deleting key:", error);
    }
  };

  const handleDeleteAllIncomplete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete all ${incompleteKeys.length} incomplete payment keys?`,
      )
    ) {
      return;
    }

    try {
      // Delete all incomplete keys in parallel
      await Promise.all(
        incompleteKeys.map((key) => deleteKey.mutateAsync(key.id)),
      );
      toast.success("All incomplete keys deleted");
      refetch();
    } catch (error) {
      console.error("Error deleting incomplete keys:", error);
      toast.error("Failed to delete some keys");
    }
  };

  const copyKeyToClipboard = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setShowKeyCopied(true);
      toast.success("Payment key copied to clipboard!");
      setTimeout(() => setShowKeyCopied(false), 2000);
    }
  };

  const handleImportKey = async () => {
    try {
      if (!importKeyInput.trim()) {
        toast.error("Please enter a payment key");
        return;
      }

      await importKey.mutateAsync({
        paymentKey: importKeyInput.trim(),
        initialBalance: importKeyBalance || undefined,
      });
      setImportKeyInput("");
      setImportKeyBalance("");
      setShowImportDialog(false);
      refetch();
    } catch (error) {
      console.error("Error importing payment key:", error);
    }
  };

  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const keys = status?.keys || [];
  const activeKeys = keys.filter((k) => k.isActive && !k.isIncomplete);
  const incompleteKeys = keys.filter((k) => k.isActive && k.isIncomplete);
  const inactiveKeys = keys.filter((k) => !k.isActive);

  return (
    <div className="w-full">
      <div className="space-y-6">
        {createdKey && (
          <div className="rounded-lg border-2 border-yellow-500/50 bg-yellow-500/10 p-4 sm:p-6 overflow-hidden">
            <div className="flex items-start gap-3 mb-4">
              <Copy className="size-5 shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-500" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-base font-semibold text-yellow-600 dark:text-yellow-500">
                  🔐 Save Your Payment Key NOW - Shown Only Once!
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  <strong>This is the ONLY time you'll see this key.</strong>{" "}
                  Save it immediately in a password manager or secure notes.
                </p>
              </div>
            </div>

            <div className="w-full bg-background border-2 border-yellow-500 rounded-lg p-4 space-y-3 mb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  YOUR PAYMENT KEY:
                </span>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  COPY & SAVE THIS
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-md p-3">
                <code className="text-xs break-all font-mono font-bold block">
                  {createdKey}
                </code>
              </div>
              <Button size="sm" onClick={copyKeyToClipboard} className="w-full">
                <Copy className="size-4 mr-2 shrink-0" />
                {showKeyCopied ? "✓ Copied!" : "Copy to Clipboard"}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreatedKey(null)}
              className="w-full"
            >
              <X className="size-4 mr-2 shrink-0" />
              Dismiss
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">Payment Keys</h3>
            <p className="text-sm text-muted-foreground">
              Manage your prepaid payment keys for instant transactions
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {keys.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {activeKeys.length > 0 && (
                  <Badge variant="default" className="text-xs sm:text-sm">
                    <CheckCircle2 className="size-3 mr-1 shrink-0" />
                    {activeKeys.length} Active
                  </Badge>
                )}
                {incompleteKeys.length > 0 && (
                  <Badge variant="secondary" className="text-xs sm:text-sm">
                    <AlertTriangle className="size-3 mr-1 shrink-0" />
                    {incompleteKeys.length} Incomplete
                  </Badge>
                )}
                {inactiveKeys.length > 0 && (
                  <Badge variant="outline" className="text-xs sm:text-sm">
                    <X className="size-3 mr-1 shrink-0" />
                    {inactiveKeys.length} Inactive
                  </Badge>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Dialog
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto whitespace-nowrap"
                  >
                    <Download className="size-4 mr-2 shrink-0" />
                    Import Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Import Payment Key</DialogTitle>
                    <DialogDescription>
                      Import an existing payment key that you created elsewhere
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="import-key">Payment Key</Label>
                      <Input
                        id="import-key"
                        type="text"
                        value={importKeyInput}
                        onChange={(e) => setImportKeyInput(e.target.value)}
                        placeholder="your.near:1:abc123def456..."
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Format: <code>owner:nonce:secret</code> (e.g.,{" "}
                        <code>account.near:1:abc123...</code>)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-balance">
                        Initial Balance (USD)
                      </Label>
                      <Input
                        id="import-balance"
                        type="number"
                        min="0"
                        step="0.01"
                        value={importKeyBalance}
                        onChange={(e) => setImportKeyBalance(e.target.value)}
                        placeholder="10.00"
                      />
                      <p className="text-xs text-muted-foreground">
                        Optional: Enter the amount you funded this key with
                        (e.g., 10.00 for $10)
                      </p>
                    </div>

                    <Alert>
                      <div className="flex items-start gap-3">
                        <Info className="size-4 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold">
                            Key Requirements
                          </p>
                          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                            <li>
                              Owner must match your authenticated NEAR account
                            </li>
                            <li>
                              Key must exist on-chain and have been funded
                            </li>
                            <li>
                              Each nonce can only be imported once per account
                            </li>
                          </ul>
                        </div>
                      </div>
                    </Alert>

                    <Alert className="border-blue-500/50 bg-blue-500/10">
                      <div className="flex items-start gap-3">
                        <Key className="size-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-500" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-blue-600 dark:text-blue-500">
                            🔐 Secure Storage
                          </p>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            Your payment key secret will be encrypted and stored
                            securely. Only you can use it for transactions.
                          </p>
                        </div>
                      </div>
                    </Alert>
                  </div>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={importKey.isPending}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      onClick={handleImportKey}
                      disabled={importKey.isPending || !importKeyInput.trim()}
                    >
                      {importKey.isPending
                        ? "Importing..."
                        : "Import Payment Key"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto whitespace-nowrap"
                  >
                    <Plus className="size-4 mr-2 shrink-0" />
                    Create New Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Payment Key</DialogTitle>
                    <DialogDescription>
                      Set up a prepaid payment key for instant transactions
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4 overflow-hidden">
                    <div className="space-y-2">
                      <Label htmlFor="deposit">Initial Deposit (USD)</Label>
                      <Input
                        id="deposit"
                        type="number"
                        min="1"
                        step="1"
                        value={initialDeposit}
                        onChange={(e) => setInitialDeposit(e.target.value)}
                        placeholder="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimum $1 USD. You can top up anytime.
                      </p>
                    </div>

                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 overflow-hidden">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-sm font-semibold text-destructive">
                            ⚠️ Important
                          </p>
                          <ul className="text-sm text-destructive space-y-1 list-disc list-inside">
                            <li>
                              <strong>USDC deposits are NON-REFUNDABLE</strong>
                            </li>
                            <li>
                              Your payment key will be shown{" "}
                              <strong>only ONCE</strong>
                            </li>
                            <li>
                              This key works with{" "}
                              <strong>any OutLayer project</strong>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/30 p-4 overflow-hidden">
                      <div className="flex items-start gap-3">
                        <Key className="size-4 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-semibold">
                            💡 Save Your Key
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Your payment key will be shown once after creation.
                            Save it securely - you won't be able to see it
                            again!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={createKey.isPending}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      onClick={handleCreateKey}
                      disabled={
                        createKey.isPending || parseFloat(initialDeposit) < 1
                      }
                    >
                      {createKey.isPending
                        ? "Creating..."
                        : "Create Payment Key"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {keys.length === 0 && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
            <Info className="size-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-2 min-w-0 flex-1">
              <h3 className="font-medium">No Payment Keys Yet</h3>
              <p className="text-sm text-muted-foreground">
                Your current flow works perfectly fine without this. Payment
                keys are optional for users who want faster transactions.
              </p>
            </div>
          </div>
        )}

        {incompleteKeys.length > 0 && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <AlertTitle className="flex items-center justify-between">
                  <span>
                    You have {incompleteKeys.length} incomplete payment key
                    {incompleteKeys.length > 1 ? "s" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteAllIncomplete}
                    disabled={deleteKey.isPending}
                  >
                    <Trash2 className="size-4 mr-2 shrink-0" />
                    Delete All
                  </Button>
                </AlertTitle>
                <AlertDescription className="text-sm">
                  These keys were created but never funded. They won't work for
                  transactions. You can delete them and create new ones, or
                  complete the setup by funding them.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4">
          {keys.map((key) => (
            <PaymentKeyCard
              key={key.id}
              keyData={key}
              onDelete={() => handleDelete(key.id)}
              onRefetch={refetch}
              isDeleting={deleteKey.isPending}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface PaymentKeyCardProps {
  keyData: PaymentKey;
  onDelete: () => void;
  onRefetch: () => void;
  isDeleting: boolean;
}

function PaymentKeyCard({
  keyData,
  onDelete,
  onRefetch,
  isDeleting,
}: PaymentKeyCardProps) {
  // Separate state for each dialog to avoid conflicts
  const [completeSetupAmount, setCompleteSetupAmount] = useState("1");
  const [topUpAmount, setTopUpAmount] = useState("1");
  const [isToppingUp, setIsToppingUp] = useState(false);

  const topUp = useTopUpPaymentKey();

  const handleTopUp = async (amount: string) => {
    setIsToppingUp(true);
    try {
      console.log(
        "[PaymentKeyCard] handleTopUp called with amount:",
        amount,
        "type:",
        typeof amount,
      );

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        toast.error("Please enter a valid amount");
        return;
      }

      console.log("[PaymentKeyCard] Calling topUp.mutateAsync with:", amount);
      const result = await topUp.mutateAsync(amount);
      console.log("[PaymentKeyCard] Mutation result:", result);

      if (result.transaction) {
        const { authClient } = await import("@/lib/auth-client");
        const nearAuth = authClient.near;
        if (!nearAuth) {
          toast.error("NEAR wallet not connected");
          return;
        }

        const walletAccountId = nearAuth.getAccountId();
        if (!walletAccountId) {
          toast.error("No wallet connected");
          return;
        }

        const near = nearAuth.getNearClient();

        // near-kit handles string formatting with units (e.g., "100 Tgas", "1 yocto")
        await near
          .transaction(walletAccountId)
          .functionCall(
            result.transaction.contractId,
            result.transaction.methodName,
            result.transaction.args,
            {
              gas: result.transaction.gas,
              attachedDeposit: result.transaction.deposit,
            },
          )
          .send();

        // Update the balance in our database after successful topup
        const nonce = result.transaction.args.msg
          ? JSON.parse(result.transaction.args.msg).nonce
          : null;
        if (nonce) {
          const depositMicroUnits = (parsedAmount * 1000000).toString();
          await fetch("/api/payment-keys/update-balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              nonce: nonce,
              initialBalance: depositMicroUnits,
            }),
          });
        }

        toast.success(`Added $${amount} to your payment key!`);
        onRefetch();
      }
    } catch (error) {
      console.error("Error topping up:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to top up payment key";
      toast.error(errorMessage, { duration: 8000 });
    } finally {
      setIsToppingUp(false);
    }
  };

  const statusConfig = {
    active: {
      icon: (
        <CheckCircle2 className="size-5 text-green-600 dark:text-green-500" />
      ),
      title: "Active",
      description: "Ready for instant transactions",
      badge: "default",
      bg: "bg-green-500/10 border-green-500/20",
    },
    incomplete: {
      icon: (
        <AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-500" />
      ),
      title: "Incomplete Setup",
      description: "Created but not funded yet",
      badge: "secondary",
      bg: "bg-yellow-500/10 border-yellow-500/20",
    },
    inactive: {
      icon: <X className="size-5 text-muted-foreground" />,
      title: "Inactive",
      description: "Deactivated and cannot be used",
      badge: "outline",
      bg: "bg-muted/30",
    },
  };

  const status = !keyData.isActive
    ? "inactive"
    : keyData.isIncomplete
      ? "incomplete"
      : "active";
  const config = statusConfig[status];

  return (
    <Card
      className={`w-full overflow-hidden ${status === "active" ? "border-green-500/20" : ""}`}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 ${config.bg}`}
            >
              {config.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-foreground">
                  {config.title}
                </h4>
                <Badge variant={config.badge as any} className="shrink-0">
                  {config.title}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {config.description}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Created {new Date(keyData.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Balance Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border border-border">
              <div className="text-xs text-muted-foreground mb-1">
                Available Balance
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground">
                ${keyData.availableUsd || "0.00"}
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border border-border">
              <div className="text-xs text-muted-foreground mb-1">
                Initial Deposit
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground">
                ${(parseFloat(keyData.initialBalance) / 1000000).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Status-specific messages */}
          {status === "incomplete" && (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <AlertTitle>Complete Setup Required</AlertTitle>
                  <AlertDescription className="text-sm">
                    Your payment key was created but needs funding to activate
                    it.
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}

          {status === "inactive" && (
            <Alert>
              <div className="flex items-start gap-3">
                <Info className="size-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <AlertTitle>Payment Key Inactive</AlertTitle>
                  <AlertDescription className="text-sm">
                    This payment key has been deactivated and cannot be used for
                    transactions. You can create a new key anytime.
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {status === "incomplete" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="w-full sm:flex-1" size="default">
                    <DollarSign className="size-4 mr-2 shrink-0" />
                    <span className="truncate">Fund Key (Complete Setup)</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Complete Payment Key Setup</DialogTitle>
                    <DialogDescription>
                      Fund your payment key to finish setup (minimum $1 USD)
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="complete-amount">Amount (USD)</Label>
                      <Input
                        id="complete-amount"
                        type="number"
                        min="1"
                        step="1"
                        value={completeSetupAmount}
                        onChange={(e) => setCompleteSetupAmount(e.target.value)}
                        placeholder="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimum $1 USD to activate your payment key
                      </p>
                    </div>
                  </div>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isToppingUp}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      onClick={() => handleTopUp(completeSetupAmount)}
                      disabled={
                        isToppingUp || parseFloat(completeSetupAmount) < 1
                      }
                    >
                      {isToppingUp ? "Processing..." : "Complete Setup"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {status === "active" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1">
                    <DollarSign className="size-4 mr-2 shrink-0" />
                    <span className="truncate">Top Up Balance</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Top Up Payment Key</DialogTitle>
                    <DialogDescription>
                      Add more funds to your payment key balance
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="topup-amount">Amount (USD)</Label>
                      <Input
                        id="topup-amount"
                        type="number"
                        min="1"
                        step="1"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        placeholder="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the amount you'd like to add
                      </p>
                    </div>
                  </div>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isToppingUp}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      onClick={() => handleTopUp(topUpAmount)}
                      disabled={isToppingUp || parseFloat(topUpAmount) < 1}
                    >
                      {isToppingUp ? "Processing..." : `Add $${topUpAmount}`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            <Button
              variant="outline"
              className="w-full sm:flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="size-4 mr-2 shrink-0" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
