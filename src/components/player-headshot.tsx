"use client";

import { useState } from "react";
import { normalizeName } from "@/lib/name-matching";
import type { HeadshotMap } from "@/lib/headshots";

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PlayerHeadshot({
  name,
  headshots,
  size = 28,
}: {
  name: string;
  headshots: HeadshotMap;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const url = headshots[normalizeName(name)];

  if (!url || errored) {
    return (
      <span
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36) }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-rink-blue-light font-bold text-rink-blue"
      >
        {initialsFor(name)}
      </span>
    );
  }

  // NHL headshots are framed head-and-shoulders with a fair bit of chest/
  // jersey below the face - render the image oversized and shifted up within
  // a clipped circle so the crop favors the face instead of the torso. Uses
  // plain pixel offsets (no % positioning combined with a transform) so
  // there's no sub-pixel rounding gap at small avatar sizes that would let
  // the wrapper's own background show through as a stray ring. No background
  // color on the wrapper itself either - these are transparent-background
  // cutout PNGs, so a filled wrapper would show as a mismatched disc behind
  // the player on any colored surface (e.g. the draft board's position tiles).
  const zoom = 1.7;
  const imgSize = Math.round(size * zoom);
  const offsetX = Math.round((imgSize - size) / 2);
  const offsetY = Math.round((imgSize - size) * 0.24);
  return (
    <span
      style={{ width: size, height: size }}
      className="relative inline-block shrink-0 overflow-hidden rounded-full align-middle"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny external avatar thumbnails, not worth next/image config */}
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setErrored(true)}
        style={{
          width: imgSize,
          height: imgSize,
          position: "absolute",
          left: -offsetX,
          top: -offsetY,
        }}
        className="max-w-none object-cover"
      />
    </span>
  );
}
