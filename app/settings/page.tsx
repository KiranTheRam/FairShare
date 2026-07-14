import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "administrator") redirect("/admin");
  return <SettingsClient />;
}
