"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { mobileShiftResource } from "../resources/mobile-shift-resource";
import { useMobileDesk } from "../store/mobile-desk-store";
import { mayApplyMobile } from "../utils/mobile-scan-client";
import type { DesktopCommand } from "../workstation/mobile-shift-security";
import type { ShiftResult } from "../repositories/mobile-shift-repository";
import type { CccdCheckInCapture } from "../components/cccd-check-in-panel";
import { mobileShiftRepository } from "../repositories/mobile-shift-repository";
import { recognizeDesktopIdentityDocuments } from "../utils/identity-document-ocr";

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
  const [targetGeneration, setTargetGeneration] = useState(0);
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
  const dataUpdatedAt = query.dataUpdatedAt;

  // Read incoming scan data and send ACK
  useEffect(() => {
    if (phase !== "active" || !sessionId || !targetContext || !targetKey) return;
    if (targetKeyOnView !== targetKey) return;
    if ((targetStatus !== "received" && targetStatus !== "document") || !targetRequestId || pendingRead.current === targetRequestId) return;
    pendingRead.current = targetRequestId;
    if (targetStatus === "document") {
      void mobileShiftRepository.document(hotelId, deskId, sessionId, targetRequestId).then(async ({ file, transferId }) => {
        const [result] = await recognizeDesktopIdentityDocuments([file]);
        if (!latest.current.mounted || latest.current.targetKey !== targetKey) return;
        if (!result?.success) {
          await command({ action: "discard", deskId, sessionId, requestId: targetRequestId });
          if (!latest.current.mounted || latest.current.targetKey !== targetKey) return;
          setTargetGeneration((value) => value + 1);
          report(new Error(result?.error || "Không nhận diện được hộ chiếu"));
          return;
        }
        if (!applied.current.has(transferId)) {
          latest.current.onCapture({
            guestDisplayName: result.guestDisplayName,
            guestIdentityNumber: result.guestIdentityNumber,
            guestDateOfBirth: result.guestDateOfBirth,
            guestGender: result.guestGender,
            guestNationality: result.guestNationality,
            guestResidencePlace: result.guestResidencePlace,
            documentKind: result.documentKind,
            mrzValid: result.mrzValid,
          });
          applied.current.add(transferId);
        }
        await command({ action: "ack", deskId, sessionId, requestId: targetRequestId, transferId });
        await refetchRef.current();
      }).catch(report).finally(() => { pendingRead.current = null; });
      return;
    }
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
  }, [phase, sessionId, targetStatus, targetRequestId, targetKeyOnView, targetContext, targetKey, targetLabel, hotelId, deskId, dataUpdatedAt, command, report]);

  // This effect exclusively owns the target it creates, including pre-refetch cleanup.
  useEffect(() => {
    if (phase !== "active" || !sessionId || !targetContext || !targetKey) return;

    let cancelled = false;
    let requestId: string | undefined;
    void command({ action: "target", deskId, sessionId, targetKey, targetLabel }).then(async (result) => {
      requestId = result.target?.requestId;
      if (cancelled && requestId) {
        await command({ action: "discard", deskId, sessionId, requestId });
        return;
      }
      await refetchRef.current();
    }).catch((e) => {
      report(e);
    });

    return () => {
      cancelled = true;
      if (requestId) void command({ action: "discard", deskId, sessionId, requestId }).catch(() => {});
    };
  }, [phase, sessionId, targetContext, targetKey, targetLabel, targetGeneration, deskId, command, report]);

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
    rescan: () => { setError(""); setTargetGeneration((value) => value + 1); },
  };
}
