import { redirect } from "next/navigation";

export default function LegacyAnalyticsRedirectPage() {
  redirect("/admin/analytics");
}
