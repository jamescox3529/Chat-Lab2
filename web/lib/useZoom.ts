"use client";

import { useEffect, useState } from "react";

const SIZES = ["normal", "large", "larger"] as const;
type ZoomLevel = (typeof SIZES)[number];

export function useZoom() {
  const [zoom, setZoom] = useState<ZoomLevel>("normal");

  useEffect(() => {
    const saved = (localStorage.getItem("zoom") as ZoomLevel) ?? "normal";
    applyZoom(saved);
    setZoom(saved);
  }, []);

  function zoomIn() {
    const next = SIZES[Math.min(SIZES.indexOf(zoom) + 1, SIZES.length - 1)];
    applyZoom(next);
    setZoom(next);
    localStorage.setItem("zoom", next);
  }

  function zoomOut() {
    const next = SIZES[Math.max(SIZES.indexOf(zoom) - 1, 0)];
    applyZoom(next);
    setZoom(next);
    localStorage.setItem("zoom", next);
  }

  return { zoom, zoomIn, zoomOut };
}

function applyZoom(level: ZoomLevel) {
  const html = document.documentElement;
  html.classList.remove("zoom-large", "zoom-larger");
  if (level === "large")  html.classList.add("zoom-large");
  if (level === "larger") html.classList.add("zoom-larger");
}
