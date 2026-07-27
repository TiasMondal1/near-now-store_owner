import { useEffect, useRef, useState } from "react";
import { getSession } from "../session";
import { config } from "./config";

const POLL_MS = 20_000;

export type ProfileChangeOutcome = {
  notificationId: string;
  approved: boolean;
  rejectionReason: string | null;
};

/**
 * Surfaces the outcome of an admin-reviewed profile-change request as a
 * blocking, app-wide acknowledgment — not just a banner on the Profile
 * screen. Approving/rejecting a request already persists an unread
 * `profile_change_reviewed` row to the shared `notifications` table (see
 * notification.service.ts); this polls that same store, independent of
 * whatever screen is currently focused, so the shopkeeper can't miss the
 * outcome by being on Home/Orders/Settings when the admin reviews it.
 * Marking the notification read (via dismiss()) is what "acknowledging"
 * means here — until then, the same outcome keeps reappearing on every poll.
 */
export function useProfileChangeOutcomeGate() {
  const [outcome, setOutcome] = useState<ProfileChangeOutcome | null>(null);
  const dismissingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (dismissingRef.current) return;
      try {
        const s: any = await getSession();
        if (!s?.token || cancelled) return;
        const res = await fetch(`${config.API_BASE}/store-owner/notifications?unreadOnly=true`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const data = await res.json().catch(() => null);
        if (cancelled || !Array.isArray(data)) return;
        const next = data.find((n: any) => n.type === "profile_change_reviewed");
        if (next) {
          setOutcome({
            notificationId: next.id,
            approved: !!next.data?.approved,
            rejectionReason: next.data?.rejectionReason ?? null,
          });
        }
      } catch {
        // Non-critical — next poll tick tries again.
      }
    };

    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dismiss = async () => {
    const current = outcome;
    if (!current) return;
    dismissingRef.current = true;
    setOutcome(null);
    try {
      const s: any = await getSession();
      if (s?.token) {
        await fetch(`${config.API_BASE}/store-owner/notifications/${current.notificationId}/read`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${s.token}` },
        });
      }
    } catch {
      // Non-fatal — worst case the same outcome reappears next poll, still dismissible.
    } finally {
      dismissingRef.current = false;
    }
  };

  return { outcome, dismiss };
}
