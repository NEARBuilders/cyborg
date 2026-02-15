import {
  ClientOnly,
  createFileRoute,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { ThemeToggle } from "../components/theme-toggle";
import { Menu, X, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useProfile } from "../integrations/near-social-js";
import { authClient } from "../lib/auth-client";
import { queryClient } from "../utils/orpc";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get current user account ID
  const nearState = authClient.useNearState();
  const accountId = nearState?.accountId;

  // Fetch user profile for avatar
  const { data: profile } = useProfile(accountId || "", {
    enabled: !!accountId,
  });

  // Build avatar URL from profile
  const avatarUrl = profile?.image?.ipfs_cid
    ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
    : profile?.image?.url;

  const displayName = profile?.name || accountId?.split(".")[0] || "?";

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      queryClient.invalidateQueries({ queryKey: ["session"] });
      router.invalidate();
      setMobileMenuOpen(false);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="h-dvh w-full flex flex-col bg-background text-foreground overflow-hidden">
      <header className="shrink-0 border-b border-border/50">
        <div className=" mx-auto px-4  py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="text-sm font-semibold hover:text-primary transition-colors"
              >
                Near legion
              </Link>
              <nav className="hidden md:flex items-center gap-4">
                {accountId && (
                  <Link
                    to="/chat"
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    chat
                  </Link>
                )}
                {accountId && (
                  <Link
                    to="/profile/$accountId"
                    params={{ accountId }}
                    search={{ from: undefined, tab: undefined }}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    profile
                  </Link>
                )}
                <Link
                  to="/builders"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  builders
                </Link>
              </nav>
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
                {accountId ? (
                  <div className="hidden sm:flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          <Avatar className="size-8 border border-border/50">
                            <AvatarImage src={avatarUrl} />
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-mono font-bold">
                              {displayName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                          {displayName}
                        </div>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-mono">
                          {accountId}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive focus:text-destructive"
                          onClick={handleSignOut}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          logout
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </ClientOnly>
              <button
                type="button"
                className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-screen mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          {/* Mobile header */}
          <div className="border-b border-border/50 px-4 py-4">
            <div className="flex items-center justify-between">
              <Link
                to="/"
                className="text-lg font-semibold hover:text-primary transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Near legion
              </Link>
              <button
                type="button"
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* User profile section (if logged in) */}
          {accountId && (
            <div className="px-4 py-6 border-b border-border/50">
              {/* Removed profile link - clicking avatar opens user dropdown */}
              <Avatar
                className="size-12 border border-border/50 cursor-pointer"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-mono font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {displayName}
                </p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {accountId}
                </p>
              </div>
            </div>
          )}

          {/* Navigation links */}
          <nav className="px-4 py-6 space-y-1">
            {accountId && (
              <Link
                to="/chat"
                className="block px-4 py-3 text-base font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                chat
              </Link>
            )}

            <Link
              to="/builders"
              className="block px-4 py-3 text-base font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              builders
            </Link>
            {accountId && (
              <>
                <Link
                  to="/profile/$accountId"
                  params={{ accountId }}
                  search={{ from: undefined, tab: undefined }}
                  className="block px-4 py-3 text-base font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  profile
                </Link>
                <DropdownMenuSeparator className="mx-4" />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-3 text-base font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  logout
                </button>
              </>
            )}
          </nav>

          {/* Login section (if not logged in) */}
          {!accountId && (
            <div className="px-4 py-6 border-t border-border/50">
              <ClientOnly
                fallback={
                  <span className="text-sm text-muted-foreground font-mono">
                    ...
                  </span>
                }
              >
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-4 py-3 text-center text-base font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                >
                  login
                </Link>
              </ClientOnly>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 w-full min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
