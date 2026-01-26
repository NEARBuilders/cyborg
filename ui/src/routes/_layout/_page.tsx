import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_page")({
  component: PageLayout,
});

function PageLayout() {
  return (
    <div className="h-full flex flex-col px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
      <Outlet />
    </div>
  );
}
