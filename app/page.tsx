import { HouseholdApp } from "./household-app";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "administrator") redirect("/admin");
  return <HouseholdApp />;
}
