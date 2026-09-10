"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

function buildRelaySnippet(kkupflDraftId: string, ourDraftId: string, origin: string): string {
  const endpoint = `${origin}/api/drafts/${ourDraftId}/live-pick`;
  return `(async () => {
  const endpoint = ${JSON.stringify(endpoint)};

  // Sends the body exactly as given - the server unwraps a ".message"
  // field itself and treats {type: "ping"|"welcome"|"confirm_subscription"}
  // as ignorable, matching ActionCable's own frame shape.
  async function post(bodyObj) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      return await res.json();
    } catch (err) {
      console.error("[kkupfl relay] post failed", err);
      return null;
    }
  }

  // Catch-up pass: WebSocket subscriptions only get FUTURE messages, so if
  // you're connecting after the draft already started, scan the results
  // table's current contents first - one request per cell, sequential (not
  // parallel) so picks don't race each other for the same open slot. Each
  // cell's full text is a blob like "1-1 (1)\\nN. MacKinnon\\nC - COL
  // (auto)" that will never match a player name as one whole string - split
  // it into individual lines and send those instead, so the server's
  // recursive matcher can try each line as its own candidate.
  //
  // kkupfl's own leading label - "{round}-{pick in round} ({overall pick})"
  // - already tells us exactly which slot this is. Once any round of the
  // draft reverses order (which is most rounds, for a lot of common draft
  // formats), the table isn't scanned in chronological pick order, so
  // relying on "fill the next open slot" gets picks scrambled into the
  // wrong teams - sending kkupfl's own numbers lets the server address the
  // exact slot directly instead of guessing from scan order.
  const PICK_LABEL_RE = /^(\\d+)[\\u2013-](\\d+)\\s*\\((\\d+)\\)/;
  const cells = document.querySelectorAll(".draft-results-table td, .draft-results-table th");
  let caughtUp = 0;
  for (const cell of cells) {
    const lines = cell.textContent.split("\\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const body = { message: lines };
    const labelMatch = lines[0] && lines[0].match(PICK_LABEL_RE);
    if (labelMatch) {
      body.round = Number(labelMatch[1]);
      body.pickInRound = Number(labelMatch[2]);
      body.pickNumber = Number(labelMatch[3]);
    }
    const result = await post(body);
    if (result?.matched && !result.alreadyDrafted) caughtUp++;
  }
  console.log(\`[kkupfl relay] catch-up scanned \${cells.length} cells, drafted \${caughtUp} players\`);

  // Then listen live for anything from here on.
  const ws = new WebSocket("wss://draft.kkupfl.com/cable");
  ws.onopen = () => {
    ws.send(JSON.stringify({
      command: "subscribe",
      identifier: JSON.stringify({ channel: "DraftRoomChannel", draft_id: "${kkupflDraftId}" }),
    }));
    console.log("[kkupfl relay] connected + subscribed");
  };
  ws.onmessage = (e) => {
    let payload;
    try {
      payload = JSON.parse(e.data);
    } catch {
      return;
    }
    post(payload).then((result) => {
      if (result) console.log("[kkupfl relay]", result);
    });
  };
  ws.onerror = (e) => console.error("[kkupfl relay] error", e);
  ws.onclose = (e) => console.warn("[kkupfl relay] closed", e.code, e.reason);
})();`;
}

export function KkupflLiveSync() {
  const params = useParams<{ draftId: string }>();
  const [externalDraftId, setExternalDraftId] = useState("");
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const snippet = buildRelaySnippet(externalDraftId, params.draftId, window.location.origin);
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
        Live Sync (kkupfl) <span className="font-sans font-normal normal-case text-ink-faint">(experimental)</span>
      </h3>
      <p className="mt-1 text-xs text-ink-faint">
        Paste the relay script into a browser console tab that&apos;s actually open on{" "}
        <span className="text-ink-dim">draft.kkupfl.com</span> (it has to run there, not here, or
        kkupfl&apos;s server refuses the connection). Matching happens on our server; this page
        polls periodically and picks show up here automatically once matched. Safe to paste any
        time, even mid-draft &mdash; it scans the current results table for anything already
        picked before it starts listening for new picks.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink-dim">
          kkupfl draft ID
          <input
            value={externalDraftId}
            onChange={(e) => setExternalDraftId(e.target.value)}
            placeholder="e.g. 636"
            className="w-24 rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
          />
        </label>
        <button
          onClick={handleCopy}
          disabled={!externalDraftId.trim()}
          className="rounded bg-rink-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-rink-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy relay script"}
        </button>
      </div>
    </div>
  );
}
