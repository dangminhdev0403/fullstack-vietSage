"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { workstationRepository } from "../repositories/workstation-repository";
import type { IntakePayloadV2 } from "../intake/intake-contract";

export type WorkstationScanState = 
  | { phase: 'checking' }
  | { phase: 'offline' }
  | { phase: 'ready' }
  | { phase: 'requested'; scanRequestId: string; expiresAt: number }
  | { phase: 'receiving' }
  | { phase: 'received'; payload: IntakePayloadV2; capturedTransferId: string }
  | { phase: 'expired' }
  | { phase: 'error'; message: string };

export function useWorkstationScan(hotelId: string) {
  const [state, setState] = useState<WorkstationScanState>({ phase: "checking" });
  const [pairCode, setPairCode] = useState<string | null>(null);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const currentScanIdRef = useRef<string | null>(null);
  const pollingRef = useRef(false);
  
  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await workstationRepository.getPairingStatus(hotelId);
      if (res.online) {
        setState((prev) => (prev.phase === 'checking' || prev.phase === 'offline' ? { phase: 'ready' } : prev));
        setPairCode(null);
      } else {
        setState((prev) => (prev.phase === 'checking' || prev.phase === 'ready' ? { phase: 'offline' } : prev));
      }
    } catch {
      setState({ phase: 'error', message: 'Failed to check status' });
    }
  }, [hotelId]);

  useEffect(() => {
    const initialCheck = setTimeout(() => void checkStatus(), 0);
    timerRef.current = setInterval(checkStatus, 30_000);
    return () => {
      clearTimeout(initialCheck);
      clearTimers();
    };
  }, [checkStatus, clearTimers]);

  const requestScan = useCallback(async () => {
    try {
      setState({ phase: 'checking' });
      const res = await workstationRepository.requestScan(hotelId);
      currentScanIdRef.current = res.scanRequestId;
      setState({ phase: 'requested', scanRequestId: res.scanRequestId, expiresAt: res.expiresAt });
      
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      scanTimerRef.current = setInterval(async () => {
        if (!currentScanIdRef.current || pollingRef.current) return;
        pollingRef.current = true;
        try {
          const scan = await workstationRepository.readScan(currentScanIdRef.current, hotelId);
          if (scan.status === "received" && scan.payload) {
            setState({ phase: 'received', payload: scan.payload, capturedTransferId: scan.payload.transferId });
            currentScanIdRef.current = null;
            if (scanTimerRef.current) clearInterval(scanTimerRef.current);
            await workstationRepository.acknowledgeScan(scan.scanRequestId, hotelId);
          } else if (Date.now() >= scan.expiresAt) {
            setState({ phase: 'expired' });
            currentScanIdRef.current = null;
            if (scanTimerRef.current) clearInterval(scanTimerRef.current);
          }
        } catch (error: unknown) {
          if (error instanceof Error && error.message.includes('hết hạn')) {
             setState({ phase: 'expired' });
             currentScanIdRef.current = null;
             if (scanTimerRef.current) clearInterval(scanTimerRef.current);
          }
        } finally {
          pollingRef.current = false;
        }
      }, 750);
    } catch {
      setState({ phase: 'error', message: 'Lỗi yêu cầu quét' });
    }
  }, [hotelId]);

  const createPairing = useCallback(async () => {
    try {
      const res = await workstationRepository.createPairing(hotelId);
      setPairCode(res.code);
    } catch {
      // ignore
    }
  }, [hotelId]);

  const disconnect = useCallback(async () => {
    await workstationRepository.disconnect(hotelId);
    setPairCode(null);
    setState({ phase: "offline" });
  }, [hotelId]);

  const reset = useCallback(() => {
    if (currentScanIdRef.current) {
      workstationRepository.discardScan(currentScanIdRef.current, hotelId).catch(() => {});
      currentScanIdRef.current = null;
    }
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    setState({ phase: 'checking' });
    checkStatus();
  }, [hotelId, checkStatus]);
  
  useEffect(() => {
    return () => {
      if (currentScanIdRef.current) {
        workstationRepository.discardScan(currentScanIdRef.current, hotelId).catch(() => {});
      }
    };
  }, [hotelId]);

  return { state, pairCode, requestScan, createPairing, disconnect, reset };
}
