import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/persediaan/adjustment")({
  component: () => <Outlet />,
});
