import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pengadaan/receive-goods")({
  component: () => <Outlet />,
});
