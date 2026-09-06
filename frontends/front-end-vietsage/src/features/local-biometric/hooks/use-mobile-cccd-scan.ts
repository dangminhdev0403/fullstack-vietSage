"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { mobileShiftResource } from "../resources/mobile-shift-resource";
import { useMobileDesk } from "../store/mobile-desk-store";
import { mayApplyMobile } from "../utils/mobile-scan-client";
import type { DesktopCommand } from "../workstation/mobile-shift-security";
import type { ShiftResult } from "../repositories/mobile-shift-repository";
import type { CccdCheckInCapture } from "../components/cccd-check-in-panel";

type Props = { hotelId: string; targetContext: string; targetLabel: string; onCapture: (value: CccdCheckInCapture | null) => void };
export function useMobileCccdScan({ hotelId, targetContext, targetLabel, onCapture }: Props) {
  const { deskId, initialize } = useMobileDesk();
  useEffect(initialize, [initialize]);
  const resource = useMemo(() => mobileShiftResource.bind({ hotelId, deskId }), [hotelId, deskId]);
  const deskQueryOptions = useMemo(() => resource.queries.desk.options(), [resource]);
  const deskMutationOptions = useMemo(() => resource.mutations.desk.options(), [resource]);

  const query = useQuery({
    ...deskQueryOptions,
    enabled: !!deskId,
    refetchInterval: (q) => {
      const data = q.state.data as (ShiftResult & { session?: null }) | undefined;
      const phase = data && "phase" in data ? data.phase : undefined;
      return phase === "pairing" || phase === "pending" || phase === "active" ? 2000 : false;
    },
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 1000,
  });
  const mutation = useMutation({ ...deskMutationOptions, retry: false });
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const targetKey = useMemo(() => targetContext ? `${deskId}:${targetContext}` : "", [deskId, targetContext]);
  const view = query.data && "sessionId" in query.data ? query.data : null;
  const latest = useRef({ targetKey, onCapture, mounted: true });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const applied = useRef(new Set<string>());
  const pendingRead = useRef<string | null>(null);
  const mutateRef = useRef(mutation.mutateAsync);
  const refetchRef = useRef(query.refetch);

  useLayoutEffect(() => {
    latest.current = { targetKey, onCapture, mounted: true };
    mutateRef.current = mutation.mutateAsync;
    refetchRef.current = query.refetch;
    return () => { latest.current.mounted = false; };
  }, [targetKey, onCapture, mutation.mutateAsync, query.refetch]);

  const command = useCallback((body: DesktopCommand): Promise<ShiftResult> => {
    const job = queue.current.catch(() => {}).then(() => mutateRef.current(body));
    queue.current = job;
    return job;
  }, []);
  const report = useCallback((e: unknown) => { if (latest.current.mounted) setError(e instanceof Error ? e.message : "Không thể kết nối điện thoại."); }, []);

  const phase = view?.phase;
  const sessionId = view?.sessionId;
  const targetStatus = view?.target?.status;
  const targetRequestId = view?.target?.requestId;
  const targetKeyOnView = view?.target?.key;

  // Read incoming scan data and send ACK
  useEffect(() => {
    if (phase !== "active" || !sessionId || !targetContext || !targetKey) return;
    if (targetKeyOnView !== targetKey) return;
    if (targetStatus !== "received" || !targetRequestId || pendingRead.current === targetRequestId) return;
    pendingRead.current = targetRequestId;
    void command({ action: "read", deskId, sessionId }).then(async (received) => {
      if (!latest.current.mounted || latest.current.targetKey !== targetKey || !mayApplyMobile(received, targetKey)) return;
      const payload = received.payload!;
      if (!applied.current.has(payload.transferId)) {
        latest.current.onCapture({
          guestDisplayName: payload.guest.displayName,
          guestIdentityNumber: payload.guest.identityNumber,
          guestDateOfBirth: payload.guest.dateOfBirth,
          guestGender: payload.guest.gender,
          guestNationality: payload.guest.nationality,
          guestResidencePlace: payload.guest.residencePlace,
          payload,
        });
        applied.current.add(payload.transferId);
      }
      await command({ action: "ack", deskId, sessionId, requestId: received.target!.requestId, transferId: payload.transferId });
      await refetchRef.current();
    }).catch(report).finally(() => { pendingRead.current = null; });
  }, [phase, sessionId, targetStatus, targetRequestId, targetKeyOnView, targetContext, targetKey, deskId, command, report]);

  const targetedKeyRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const deskIdRef = useRef(deskId);

  useLayoutEffect(() => {
    sessionIdRef.current = sessionId ?? null;
    deskIdRef.current = deskId;
  }, [sessionId, deskId]);

  // Establish target when targetContext / targetKey changes (e.g. switching to Guest 2, 3, 4)
  useEffect(() => {
    if (phase !== "active" || !sessionId || !targetContext || !targetKey) {
      targetedKeyRef.current = null;
      activeRequestIdRef.current = null;
      return;
    }
    // Only dispatch target when key has changed
    if (targetedKeyRef.current === targetKey) return;
    targetedKeyRef.current = targetKey;

    let cancelled = false;
    void command({ action: "target", deskId, sessionId, targetKey, targetLabel }).then(async (result) => {
      if (cancelled) return;
      activeRequestIdRef.current = result.target?.requestId ?? null;
      await refetchRef.current();
    }).catch((e) => {
      if (targetedKeyRef.current === targetKey) targetedKeyRef.current = null;
      report(e);
    });

    return () => {
      cancelled = true;
    };
  }, [phase, sessionId, targetContext, targetKey, targetLabel, deskId, command, report]);

  // Discard open target ONLY when the scanning component unmounts (e.g. check-in modal closed)
  useEffect(() => {
    return () => {
      const sId = sessionIdRef.current;
      const reqId = activeRequestIdRef.current;
      if (sId && reqId) {
        void command({ action: "discard", deskId: deskIdRef.current, sessionId: sId, requestId: reqId }).catch(() => {});
      }
    };
  }, [command]);

  const perform = async (body: DesktopCommand) => {
    setBusy(true); setError("");
    try {
      const result = await command(body);
      if (!latest.current.mounted) return;
      if (body.action === "create") setCode(result.code ?? "");
      if (body.action === "revoke" || body.action === "approve") setCode("");
      await refetchRef.current();
    } catch (e) { report(e); } finally { if (latest.current.mounted) setBusy(false); }
  };
  return {
    view, code, busy, error: error || (query.error instanceof Error ? query.error.message : ""),
    create: () => perform({ action: "create", deskId }),
    approve: () => view?.comparisonCode && perform({ action: "approve", deskId, sessionId: view.sessionId, comparisonCode: view.comparisonCode }),
    revoke: () => view && perform({ action: "revoke", deskId, sessionId: view.sessionId }),
    rescan: () => {
      targetedKeyRef.current = null;
      return view && perform({ action: "target", deskId, sessionId: view.sessionId, targetKey, targetLabel });
    },
  };
}
