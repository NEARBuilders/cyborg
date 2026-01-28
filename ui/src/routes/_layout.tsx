import {
  ClientOnly,
  createFileRoute,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { ThemeToggle } from "../components/theme-toggle";
import { UserNav } from "../components/user-nav";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  return (
    <div className="h-dvh w-full flex flex-col bg-background text-foreground overflow-hidden">
      <header className="shrink-0 border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="text-sm font-semibold hover:text-primary transition-colors"
              >
                Near legion
              </Link>
              <Link
                to="/builders"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                builders
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <ClientOnly
                fallback={
                  <span className="text-xs text-muted-foreground font-mono">
                    ...
                  </span>
                }
              >
                <UserNav />
              </ClientOnly>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full min-h-0 overflow-hidden">
        <Outlet />
      </main>

      <footer className="shrink-0 border-t border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <a
            href="/api"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            api
          </a>
        </div>
      </footer>
    </div>
  );
}
