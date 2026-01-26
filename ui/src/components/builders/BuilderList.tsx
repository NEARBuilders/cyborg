/**
 * Builder List Component
 * Left panel showing all builders
 */

import { BuilderListItem, type Builder } from "./BuilderListItem";

interface BuilderListProps {
  builders: Builder[];
  selectedId: string;
  onSelect: (builder: Builder) => void;
}

export function BuilderList({ builders, selectedId, onSelect }: BuilderListProps) {
  return (
    <div className="w-full lg:w-[350px] shrink-0 border border-primary/30 bg-background flex flex-col h-full">
      <div className="px-4 py-3 border-b border-primary/20 bg-primary/5 shrink-0">
        <span className="text-sm text-primary font-mono uppercase tracking-wider font-medium">
          {builders.length} Legionnaires
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border/40">
          {builders.map((builder) => (
            <BuilderListItem
              key={builder.id}
              builder={builder}
              isSelected={selectedId === builder.id}
              onSelect={() => onSelect(builder)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
