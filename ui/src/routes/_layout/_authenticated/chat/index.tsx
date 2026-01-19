/**
 * Chat Route - Alias to canonical "/" route
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_authenticated/chat/")({
  beforeLoad: () => {
    throw redirect({
      to: "/",
    });
  },
});
