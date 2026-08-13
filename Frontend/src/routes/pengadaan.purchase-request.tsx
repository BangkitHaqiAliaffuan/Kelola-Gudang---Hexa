import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pengadaan/purchase-request")({
  component: () => <Outlet />,
});
