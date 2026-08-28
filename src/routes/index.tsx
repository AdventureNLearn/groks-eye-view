import { createFileRoute } from "@tanstack/react-router";
import { IntelApp } from "@/components/intel/IntelApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <IntelApp />;
}
