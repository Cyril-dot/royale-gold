// /owner/engage — no index page duplicates content (audit §4.2):
// it redirects to the first route in the group.
import { redirect } from "next/navigation";

export default function OwnerEngageIndex() {
  redirect("/owner/engage/promotions");
}
