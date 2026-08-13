import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pengadaan/purchase-order")({
  component: () => <Outlet />,
});
