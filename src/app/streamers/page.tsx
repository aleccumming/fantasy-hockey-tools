import { redirect } from "next/navigation";

// Streamer Suggestions merged into the Player Evaluator page (now "Skaters")
// - same tool, one page, an "Unowned" toggle instead of a separate URL.
export default function StreamersRedirect() {
  redirect("/skaters");
}
