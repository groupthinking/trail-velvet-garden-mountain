import { createFileRoute } from "@tanstack/react-router";
import { CosApp } from "@/components/cos-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CosApp />;
}
