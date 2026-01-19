/**
 * KV Store Editor Component
 * Simple UI for testing per-user key-value storage
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { apiClient } from "@/utils/orpc";
import { toast } from "sonner";

export function KVEditor() {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const queryClient = useQueryClient();

  // Query for fetching a value
  const { data, isLoading, error } = useQuery({
    queryKey: ["kv", key],
    queryFn: () => apiClient.getValue({ key }),
    enabled: false, // Only fetch on explicit load
  });

  // Mutation for saving a value
  const saveMutation = useMutation({
    mutationFn: () => apiClient.setValue({ key, value }),
    onSuccess: () => {
      toast.success(`Saved: ${key}`);
      queryClient.invalidateQueries({ queryKey: ["kv", key] });
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const handleLoad = () => {
    if (!key.trim()) {
      toast.error("Please enter a key");
      return;
    }
    queryClient.fetchQuery({ queryKey: ["kv", key], queryFn: () => apiClient.getValue({ key }) })
      .then((result) => {
        if (result) {
          setValue(result.value);
          toast.success(`Loaded: ${key}`);
        } else {
          setValue("");
          toast.info(`No value found for: ${key}`);
        }
      })
      .catch((err) => {
        toast.error(`Failed to load: ${err instanceof Error ? err.message : "Unknown error"}`);
      });
  };

  const handleSave = () => {
    if (!key.trim()) {
      toast.error("Please enter a key");
      return;
    }
    if (!value.trim()) {
      toast.error("Please enter a value");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="p-6 rounded-xl border border-border/50 bg-muted/20">
      <div className="mb-4">
        <h3 className="text-base font-medium mb-1">Default Values</h3>
        <p className="text-xs text-muted-foreground">
          Store custom key-value pairs for your account. These values persist across sessions.
        </p>
      </div>

      <div className="space-y-4">
        {/* Key input */}
        <div>
          <label htmlFor="kv-key" className="block text-sm font-medium mb-2">
            Key
          </label>
          <input
            id="kv-key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="my-key"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Value input */}
        <div>
          <label htmlFor="kv-value" className="block text-sm font-medium mb-2">
            Value
          </label>
          <textarea
            id="kv-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter value..."
            rows={3}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleLoad}
            disabled={isLoading || !key.trim()}
            className="px-4 py-2 text-sm border border-border hover:border-primary/50 bg-background hover:bg-muted/40 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !key.trim() || !value.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          {key.trim() && (
            <Link
              to="/keys/$key"
              params={{ key }}
              className="px-4 py-2 text-sm border border-border hover:border-primary/50 bg-background hover:bg-muted/40 rounded-lg transition-all"
            >
              View Detail →
            </Link>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">
              {error instanceof Error ? error.message : "Error loading value"}
            </p>
          </div>
        )}

        {/* Success display */}
        {data && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-xs font-mono text-muted-foreground">
              Stored: {new Date(data.updatedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
