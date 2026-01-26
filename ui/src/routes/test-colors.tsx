import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/test-colors')({
  component: TestColors,
});

function ColorSwatch({
  name,
  bgClass,
  fgClass,
}: {
  name: string;
  bgClass: string;
  fgClass: string;
}) {
  return (
    <div className={`${bgClass} ${fgClass} rounded-lg p-6 shadow-sm border border-border`}>
      <p className="font-semibold">{name}</p>
      <p className="text-sm opacity-80 mt-1">
        bg: {bgClass}
        <br />
        text: {fgClass}
      </p>
    </div>
  );
}

function TestColors() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-foreground">Semantic Color System</h1>
          <p className="text-muted-foreground mt-2">
            Reference guide for all available semantic color classes. Use these instead of
            hardcoded colors like bg-blue-600 or text-white.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
            Core Colors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ColorSwatch
              name="Background"
              bgClass="bg-background"
              fgClass="text-foreground"
            />
            <ColorSwatch
              name="Foreground (inverted)"
              bgClass="bg-foreground"
              fgClass="text-background"
            />
            <ColorSwatch name="Card" bgClass="bg-card" fgClass="text-card-foreground" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
            Interactive Colors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ColorSwatch
              name="Primary"
              bgClass="bg-primary"
              fgClass="text-primary-foreground"
            />
            <ColorSwatch
              name="Secondary"
              bgClass="bg-secondary"
              fgClass="text-secondary-foreground"
            />
            <ColorSwatch
              name="Accent"
              bgClass="bg-accent"
              fgClass="text-accent-foreground"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
            Utility Colors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ColorSwatch
              name="Muted"
              bgClass="bg-muted"
              fgClass="text-muted-foreground"
            />
            <ColorSwatch
              name="Destructive"
              bgClass="bg-destructive"
              fgClass="text-destructive-foreground"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
            Form & Input Colors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-background rounded-lg p-6 shadow-sm border border-input">
              <p className="font-semibold text-foreground">Input Border</p>
              <p className="text-sm text-muted-foreground mt-1">border: border-input</p>
              <input
                type="text"
                placeholder="Example input"
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="bg-background rounded-lg p-6 shadow-sm border border-border">
              <p className="font-semibold text-foreground">Ring (Focus)</p>
              <p className="text-sm text-muted-foreground mt-1">ring: ring-ring</p>
              <button className="mt-3 rounded-md bg-primary px-4 py-2 text-primary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background">
                Focused Button
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
            Usage Examples
          </h2>

          <div className="bg-card text-card-foreground rounded-lg p-6 border border-border">
            <h3 className="text-lg font-semibold">Example Card Component</h3>
            <p className="text-muted-foreground mt-2">
              This card uses bg-card and text-card-foreground for the container, with
              text-muted-foreground for secondary text.
            </p>
            <div className="mt-4 flex gap-3">
              <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
                Primary Action
              </button>
              <button className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
                Secondary
              </button>
              <button className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
                Delete
              </button>
            </div>
          </div>

          <div className="bg-muted text-muted-foreground rounded-lg p-6">
            <h3 className="text-lg font-semibold text-foreground">Muted Section</h3>
            <p className="mt-2">
              Use bg-muted for subtle background sections. The text here uses
              text-muted-foreground for a subdued appearance.
            </p>
          </div>

          <div className="bg-accent text-accent-foreground rounded-lg p-6">
            <h3 className="text-lg font-semibold">Accent Highlight</h3>
            <p className="mt-2">
              Use bg-accent for highlighted or hover states. Common for menu items,
              list selections, etc.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground border-b border-border pb-2">
            Text Hierarchy
          </h2>
          <div className="bg-card rounded-lg p-6 border border-border space-y-3">
            <p className="text-foreground font-semibold">
              Primary text (text-foreground) - Use for headings and important content
            </p>
            <p className="text-muted-foreground">
              Secondary text (text-muted-foreground) - Use for descriptions and less
              important content
            </p>
            <p className="text-primary">
              Link/accent text (text-primary) - Use for links and interactive elements
            </p>
            <p className="text-destructive">
              Error text (text-destructive) - Use for error messages and warnings
            </p>
          </div>
        </section>

        <footer className="text-muted-foreground text-sm pt-8 border-t border-border">
          <p>
            Always use semantic color classes for consistent theming and dark mode support.
            Avoid hardcoded colors like bg-blue-600, text-white, text-gray-500, etc.
          </p>
        </footer>
      </div>
    </div>
  );
}
