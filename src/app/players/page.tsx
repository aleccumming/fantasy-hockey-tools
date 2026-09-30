import { redirect } from "next/navigation";

// Renamed to "Skaters" - it's the skater-only evaluator (goalies get their
// own page/nav item), and "Players" was ambiguous with the site as a whole.
// Old links/bookmarks to /players still work.
export default function PlayersRedirect() {
  redirect("/skaters");
}
