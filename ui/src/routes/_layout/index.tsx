import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "../../lib/session";
import { Button } from "../../components/ui/button";
import { authClient } from "../../lib/auth-client";
import {
  MessageSquare,
  Users,
  Sparkles,
  Shield,
  Network,
  Zap,
  Code,
  Globe,
} from "lucide-react";

export const Route = createFileRoute("/_layout/")({
  component: LandingPage,
  head: () => {
    return {
      meta: [
        { title: "Legion Social - NEAR AI Community" },
        {
          name: "description",
          content:
            "Connect, build, and chat with AI in the NEAR Legion community. Profile management, AI chat, and builder tools.",
        },
        { property: "og:title", content: "Legion Social - NEAR AI Community" },
        {
          property: "og:description",
          content:
            "Connect with the NEAR ecosystem. AI-powered chat, builder profiles, and Legion NFT integration.",
        },
        {
          property: "og:image",
          content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg`,
        },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        {
          name: "twitter:image",
          content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg`,
        },
      ],
    };
  },
});

function LandingPage() {
  const { data: session } = useQuery(sessionQueryOptions);
  const nearState = authClient.useNearState();

  // Get actual account ID for profile link
  const accountId =
    nearState?.accountId ||
    (session?.user as any)?.nearAccount?.accountId ||
    session?.user?.name;

  const isLoggedIn = !!session?.user && !!accountId;

  const features = [
    {
      icon: MessageSquare,
      title: "AI Chat",
      description:
        "Chat with NEAR AI's DeepSeek model. Streaming responses, conversation history, and intelligent context awareness.",
    },
    {
      icon: Users,
      title: "Builder Profiles",
      description:
        "Showcase your projects, skills, and social links. Edit your profile stored on NEAR Social blockchain.",
    },
    {
      icon: Shield,
      title: "Legion Status",
      description:
        "Display your NEAR Legion NFTs and Ascendant rank. Legendary, Epic, Rare, or Common - show your status.",
    },
    {
      icon: Sparkles,
      title: "NEAR Social Integration",
      description:
        "Profile data stored on NEAR Social blockchain. Update your info with wallet-signed transactions.",
    },
    {
      icon: Network,
      title: "Sign In With NEAR",
      description:
        "Secure authentication using better-near-auth. No passwords, just your NEAR wallet.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description:
        "Built on Cloudflare Pages and Workers. Global edge network for instant page loads.",
    },
  ];

  const useCases = [
    {
      icon: Code,
      title: "For Builders",
      description:
        "Create your profile, list projects, showcase skills, and connect with other NEAR developers.",
    },
    {
      icon: Globe,
      title: "For the Community",
      description:
        "Discover builders, explore projects, chat with AI, and engage with the NEAR ecosystem.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/20 bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
        <div className="relative px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
                Legion Social
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
                Connect with the NEAR ecosystem. AI-powered chat, builder
                profiles, and Legion NFT integration — all in one place.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isLoggedIn ? (
                <>
                  <Link to="/chat">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto min-w-[160px]"
                    >
                      Start Chatting
                    </Button>
                  </Link>
                  <Link to="/profile/$accountId" params={{ accountId }}>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto min-w-[160px]"
                    >
                      View Profile
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto min-w-[160px]"
                    >
                      Sign in with NEAR
                    </Button>
                  </Link>
                  <a
                    href="https://nearlegion.near"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto min-w-[160px]"
                    >
                      Join the Legion
                    </Button>
                  </a>
                </>
              )}
            </div>

            {/* Tech badges */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-8">
              <span className="text-xs px-3 py-1.5 bg-muted/50 text-muted-foreground border border-border/50 font-mono rounded-full">
                NEAR Protocol
              </span>
              <span className="text-xs px-3 py-1.5 bg-muted/50 text-muted-foreground border border-border/50 font-mono rounded-full">
                NEAR AI
              </span>
              <span className="text-xs px-3 py-1.5 bg-muted/50 text-muted-foreground border border-border/50 font-mono rounded-full">
                NEAR Social
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16"></div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="group p-5 sm:p-6 border border-border/50 bg-muted/20 rounded-xl hover:border-primary/30 hover:bg-muted/30 transition-all h-auto"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                    <div className="shrink-0 size-10 flex items-center justify-center bg-primary/20 rounded-lg">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
                      <h3 className="text-base font-semibold text-foreground">
                        {feature.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 sm:py-28 bg-muted/10 border-y border-border/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built For Everyone
            </h2>
            <p className="text-muted-foreground text-lg">
              Whether you're building or exploring, Legion Social has something
              for you.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {useCases.map((useCase, index) => {
              const Icon = useCase.icon;
              return (
                <div
                  key={index}
                  className="p-6 bg-background border border-border/50 rounded-xl"
                >
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="size-12 flex items-center justify-center bg-primary/10 rounded-full">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        {useCase.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {useCase.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Ready to Join?
          </h2>
          <p className="text-lg text-muted-foreground">
            Connect your NEAR wallet and start building your profile today.
          </p>
          {isLoggedIn ? (
            <Link to="/profile/$accountId" params={{ accountId }}>
              <Button size="lg" className="min-w-[180px]">
                Go to Your Profile
              </Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button size="lg" className="min-w-[180px]">
                Sign in with NEAR
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 sm:px-6 lg:px-8 py-8 border-t border-border/20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>Built with NEAR Protocol, NEAR AI, and Cloudflare</p>
          <div className="flex items-center gap-4">
            <a
              href="https://nearlegion.near"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              NEAR Legion
            </a>
            <a
              href="https://github.com/NEARBuilders/cyborg"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
