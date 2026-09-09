"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { mobileShiftResource } from "../resources/mobile-shift-resource";
import { MobileApiError, mobileShiftRepository } from "../repositories/mobile-shift-repository";
import type { PhoneCommand } from "../workstation/mobile-shift-security";
export function useMobilePhone() {
  const resource = mobileShiftResource.bind({ hotelId: "phone", deskId: "phone" });
  const mutation = useMutation({ ...resource.mutations.phone.options(), retry: false });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const started = useRef(false);
  const query = useQuery({ ...resource.queries.phone.options(), enabled: ready && !ended, refetchInterval: 2000, retry: false, staleTime: 1000 });
  const mutate = mutation.mutateAsync;
  const reset = mutation.reset;
  const refetch = query.refetch;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    if (!code) { queueMicrotask(() => setReady(true)); return; }
    void mutate({ action: "claim", code }).catch((e) => setError(e instanceof Error ? e.message : "Không thể ghép điện thoại.")).finally(() => { reset(); setReady(true); });
  }, [mutate, reset]);
  const send = async (body: PhoneCommand) => {
    setError("");
    try { const result = await mutate(body); await refetch(); return result; }
    finally { reset(); }
  };
  const sendDocument = async (requestId: string, transferId: string, file: File) => {
    setError("");
    const result = await mobileShiftRepository.sendDocument(requestId, transferId, file);
    await refetch();
    return result;
  };
  const terminalError = query.error instanceof MobileApiError && [401, 403, 404].includes(query.error.status);
  return { view: ended || terminalError ? null : query.data ?? null, ready, online: !query.isError && !ended,
    error: error || (query.error instanceof Error ? query.error.message : ""), send, sendDocument,
    disconnect: async () => { try { await send({ action: "disconnect" }); setEnded(true); } catch(e) { setError(e instanceof Error ? e.message : "Không thể ngắt phiên."); } },
  };
}
