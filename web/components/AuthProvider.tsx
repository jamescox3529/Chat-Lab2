"use client";

/**
 * AuthProvider
 * ============
 * Runs client-side only. Grabs the Clerk session token and injects it into
 * the api.ts module so every fetch automatically includes `Authorization: Bearer …`.
 * Refreshes the token every 55 seconds (Clerk tokens expire after 60s).
 */

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setAuthToken } from "@/lib/api";

export default function AuthProvider() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setAuthToken(null);
      return;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const token = await getToken();
        if (!cancelled) setAuthToken(token);
      } catch {
        // silently ignore — next refresh will retry
      }
    }

    refresh();
    const interval = setInterval(refresh, 55_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isSignedIn, getToken]);

  return null;
}
