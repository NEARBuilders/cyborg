import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "../theme-toggle";

interface HeaderProps {
  accountId?: string | null;
  userRole?: string | null;
  onSignOut: () => void;
}

export function Header({ accountId, userRole, onSignOut }: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-border/20 bg-background/80 backdrop-blur-sm">
      <div className="px-3 sm:px-4 lg:px-6 py-2.5">
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          <ThemeToggle />
          {accountId ? (
            <>
              {userRole === "admin" && (
                <Link
                  to="/dashboard"
                  className="text-xs text-muted-foreground/50 hover:text-primary transition-colors font-mono"
                >
                  admin
                </Link>
              )}
              <Link
                to="/settings"
                className="text-xs text-muted-foreground/50 hover:text-primary transition-colors font-mono"
              >
                settings
              </Link>
              <span className="text-xs text-primary/70 font-mono truncate max-w-[100px] sm:max-w-[160px]">
                {accountId}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="text-xs text-muted-foreground/50 hover:text-primary transition-colors font-mono"
              >
                exit
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-xs text-muted-foreground/50 hover:text-primary transition-colors font-mono"
            >
              login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
