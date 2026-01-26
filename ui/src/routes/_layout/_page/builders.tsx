/**
 * Builders Page
 * Displays NEAR Legion builders directory
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BuilderList, BuilderDetails, BuilderListItem, type Builder } from "@/components/builders";

export const Route = createFileRoute("/_layout/_page/builders")({
  component: BuildersPage,
});

// Mock data - replace with API call later
const mockBuilders: Builder[] = [
  {
    id: "1",
    accountId: "alice.near",
    displayName: "Alice",
    avatar: null,
    role: "Core Developer",
    tags: ["Smart Contracts", "Rust", "DeFi"],
    description:
      "Building decentralized finance primitives on NEAR. Focused on creating trustless lending protocols and automated market makers. Previously worked on Ethereum DeFi projects before joining the NEAR ecosystem.",
    projects: [
      {
        name: "LendNEAR",
        description: "Decentralized lending protocol with dynamic interest rates",
        status: "Active",
      },
      {
        name: "SwapLegion",
        description: "AMM with concentrated liquidity for NEAR tokens",
        status: "In Development",
      },
    ],
    socials: {
      github: "alice-near",
      twitter: "alice_builds",
    },
  },
  {
    id: "2",
    accountId: "bob.near",
    displayName: "Bob",
    avatar: null,
    role: "Frontend Lead",
    tags: ["React", "UI/UX", "TypeScript"],
    description:
      "Crafting beautiful user experiences for NEAR dApps. Specializing in React and design systems. Passionate about making Web3 accessible to everyone through intuitive interfaces.",
    projects: [
      {
        name: "NEAR Kit",
        description: "Component library for NEAR dApps",
        status: "Active",
      },
    ],
    socials: {
      github: "bob-frontend",
    },
  },
  {
    id: "3",
    accountId: "carol.near",
    displayName: "Carol",
    avatar: null,
    role: "Protocol Engineer",
    tags: ["Blockchain", "Security", "Auditing"],
    description:
      "Security researcher and protocol engineer. Conducting audits and building secure infrastructure for the NEAR ecosystem. Background in cryptography and formal verification.",
    projects: [
      {
        name: "SafeGuard",
        description: "Smart contract security scanning tool",
        status: "Beta",
      },
      {
        name: "AuditDAO",
        description: "Decentralized security audit coordination",
        status: "Planning",
      },
    ],
    socials: {
      github: "carol-sec",
      twitter: "carol_audits",
    },
  },
  {
    id: "4",
    accountId: "dave.near",
    displayName: "Dave",
    avatar: null,
    role: "DevRel",
    tags: ["Documentation", "Education", "Community"],
    description:
      "Developer relations and education. Creating tutorials, documentation, and educational content to onboard new developers to the NEAR ecosystem. Running workshops and hackathons.",
    projects: [
      {
        name: "NEAR Academy",
        description: "Interactive learning platform for NEAR development",
        status: "Active",
      },
    ],
    socials: {
      twitter: "dave_teaches",
    },
  },
  {
    id: "5",
    accountId: "eve.near",
    displayName: "Eve",
    avatar: null,
    role: "Infrastructure",
    tags: ["Indexers", "APIs", "DevOps"],
    description:
      "Building the backbone infrastructure for NEAR applications. Maintaining indexers, APIs, and developer tooling. Focused on reliability and scalability.",
    projects: [
      {
        name: "NEAR Graph",
        description: "High-performance indexer for NEAR blockchain data",
        status: "Active",
      },
      {
        name: "RPC Plus",
        description: "Enhanced RPC endpoints with caching and analytics",
        status: "Active",
      },
    ],
    socials: {
      github: "eve-infra",
    },
  },
  {
    id: "6",
    accountId: "frank.near",
    displayName: "Frank",
    avatar: null,
    role: "Smart Contract Dev",
    tags: ["Rust", "WASM", "Testing"],
    description: "Building secure and efficient smart contracts for the NEAR ecosystem.",
    projects: [{ name: "ContractKit", description: "Smart contract templates", status: "Active" }],
    socials: { github: "frank-contracts" },
  },
  {
    id: "7",
    accountId: "grace.near",
    displayName: "Grace",
    avatar: null,
    role: "Product Designer",
    tags: ["Figma", "UX Research", "Prototyping"],
    description: "Designing intuitive Web3 experiences that bridge complexity with usability.",
    projects: [{ name: "NEAR Design System", description: "Unified design language", status: "Active" }],
    socials: { twitter: "grace_designs" },
  },
  {
    id: "8",
    accountId: "henry.near",
    displayName: "Henry",
    avatar: null,
    role: "Data Engineer",
    tags: ["Analytics", "Python", "SQL"],
    description: "Building data pipelines and analytics tools for blockchain insights.",
    projects: [{ name: "ChainMetrics", description: "On-chain analytics dashboard", status: "Beta" }],
    socials: { github: "henry-data" },
  },
  {
    id: "9",
    accountId: "iris.near",
    displayName: "Iris",
    avatar: null,
    role: "Community Lead",
    tags: ["Growth", "Events", "Partnerships"],
    description: "Growing the NEAR community through events, partnerships, and engagement.",
    projects: [{ name: "NEAR Meetups", description: "Global community events", status: "Active" }],
    socials: { twitter: "iris_community" },
  },
  {
    id: "10",
    accountId: "jack.near",
    displayName: "Jack",
    avatar: null,
    role: "Mobile Developer",
    tags: ["React Native", "iOS", "Android"],
    description: "Building mobile-first experiences for NEAR dApps.",
    projects: [{ name: "NEAR Wallet Mobile", description: "Mobile wallet app", status: "In Development" }],
    socials: { github: "jack-mobile" },
  },
  {
    id: "11",
    accountId: "kate.near",
    displayName: "Kate",
    avatar: null,
    role: "Technical Writer",
    tags: ["Documentation", "Tutorials", "API Docs"],
    description: "Making NEAR accessible through clear and comprehensive documentation.",
    projects: [{ name: "NEAR Docs", description: "Official documentation", status: "Active" }],
    socials: { github: "kate-docs" },
  },
  {
    id: "12",
    accountId: "leo.near",
    displayName: "Leo",
    avatar: null,
    role: "Game Developer",
    tags: ["Unity", "Gaming", "NFTs"],
    description: "Creating blockchain-powered gaming experiences on NEAR.",
    projects: [{ name: "NEAR Quest", description: "Play-to-earn RPG", status: "Beta" }],
    socials: { twitter: "leo_games" },
  },
];

function BuildersPage() {
  const [selectedBuilder, setSelectedBuilder] = useState<Builder>(mockBuilders[0]);
  const [showList, setShowList] = useState(true);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">
          NEAR Legion Builders
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Discover the builders shaping the NEAR ecosystem
        </p>
      </div>

      {/* Mobile: Tab switcher */}
      <div className="flex lg:hidden gap-2">
        <button
          onClick={() => setShowList(true)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            showList
              ? "bg-primary text-primary-foreground"
              : "bg-muted/30 text-muted-foreground"
          }`}
        >
          All Builders ({mockBuilders.length})
        </button>
        <button
          onClick={() => setShowList(false)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            !showList
              ? "bg-primary text-primary-foreground"
              : "bg-muted/30 text-muted-foreground"
          }`}
        >
          {selectedBuilder.displayName}
        </button>
      </div>

      {/* Mobile: Conditional panels - full height */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto">
        {showList ? (
          <div className="border border-primary/30 bg-background">
            <div className="divide-y divide-border/40">
              {mockBuilders.map((builder) => (
                <div
                  key={builder.id}
                  onClick={() => {
                    setSelectedBuilder(builder);
                    setShowList(false);
                  }}
                >
                  <BuilderListItem
                    builder={builder}
                    isSelected={selectedBuilder.id === builder.id}
                    onSelect={() => {
                      setSelectedBuilder(builder);
                      setShowList(false);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <BuilderDetails builder={selectedBuilder} />
        )}
      </div>

      {/* Desktop: Side by side - full height */}
      <div className="hidden lg:flex lg:flex-row gap-4 flex-1 min-h-0">
        <BuilderList
          builders={mockBuilders}
          selectedId={selectedBuilder.id}
          onSelect={setSelectedBuilder}
        />
        <BuilderDetails builder={selectedBuilder} />
      </div>
    </div>
  );
}
