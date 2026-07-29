import { useEffect, useRef, useState } from "react";
import { getSession } from "../session";
import { config } from "./config";

const POLL_MS = 20_000;

export type ReviewOutcome = {
  notificationId: string;
  kind: "profile_change" | "product_submission";
  approved: boolean;
  rejectionReason: string | null;
  productName?: string;
};

/**
 * Surfaces the outcome of an admin-reviewed request as a blocking, app-wide
 * acknowledgment — not just a banner on whichever screen triggered it.
 * Started as profile-change-only (store name/address/phone edits); now also
 * covers custom-product submissions (add.product.tsx / stock.tsx), since
 * both persist an unread `*_reviewed` row to the shared `notifications`
 * table the same way (see notification.service.ts's
 * notifyProfileChangeReviewed / notifyProductSubmissionReviewed) and both
 * need the same "can't miss it by being on a different tab" guarantee.
 * Marking the notification read (via dismiss()) is what "acknowledging"
 * means here — until then, the same outcome keeps reappearing on every poll.
 */
export function useReviewOutcomeGate() {
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
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

        const profileChange = data.find((n: any) => n.type === "profile_change_reviewed");
        const productSubmission = data.find((n: any) => n.type === "product_submission_reviewed");
        const next = profileChange ?? productSubmission;
        if (!next) return;

        if (next === profileChange) {
          setOutcome({
            notificationId: next.id,
            kind: "profile_change",
            approved: !!next.data?.approved,
            rejectionReason: next.data?.rejectionReason ?? null,
          });
        } else {
          setOutcome({
            notificationId: next.id,
            kind: "product_submission",
            approved: !!next.data?.approved,
            rejectionReason: next.data?.rejectionReason ?? null,
            productName: next.data?.productName,
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
