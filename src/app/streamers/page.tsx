import { redirect } from "next/navigation";

// Streamer Suggestions merged into the Player Evaluator page (now just
// "Players") - same tool, one page, an "Unowned" toggle instead of a
// separate URL.
export default function StreamersRedirect() {
  redirect("/players");
}
