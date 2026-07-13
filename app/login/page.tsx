import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUsers } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "administrator" ? "/admin" : "/");
  return <LoginForm initialSetup={!(await hasAnyUsers())} />;
}
