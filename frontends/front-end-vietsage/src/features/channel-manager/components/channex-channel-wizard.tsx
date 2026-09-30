"use client";

import { useMemo, useState } from "react";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";
import type {
  ChannexChannelCreateInput,
  ChannexChannelCreateResult,
  ChannexChannelParameter,
  ChannexChannelPrepareInput,
  ChannexChannelPrepareResult,
  ChannexChannelProvider,
  ChannexSettingValue,
} from "../types/channel-manager.types";
import {
  buildRateMappingSettings,
  flattenRemoteRates,
  resolveRateOccupancy,
} from "./channex-channel-wizard.utils";

const COMMON_NATIVE_RATE_FIELDS = new Set([
  "room_type_code",
  "rate_plan_code",
  "occupancy",
  "pricing_type",
  "primary_occ",
  "readonly",
  "occ_changed",
]);

interface ChannexChannelWizardProps {
  provider: ChannexChannelProvider;
  onClose: () => void;
  onFallback: () => Promise<void>;
  prepare: (
    input: ChannexChannelPrepareInput,
  ) => Promise<ChannexChannelPrepareResult>;
  create: (
    input: ChannexChannelCreateInput,
  ) => Promise<ChannexChannelCreateResult>;
  activate: (
    channelId: string,
  ) => Promise<{ channelId: string; isActive: boolean }>;
  isPreparing: boolean;
  isCreating: boolean;
  isActivating: boolean;
}

function initialSettings(fields: ChannexChannelParameter[]) {
  return Object.fromEntries(
    fields
      .filter((field) => field.default !== undefined)
      .map((field) => [field.key, field.default as ChannexSettingValue]),
  );
}

function isFieldHidden(
  field: ChannexChannelParameter,
  settings: Record<string, ChannexSettingValue>,
) {
  if (field.type === "hidden") return true;
  return field.rules?.some(
    (rule) =>
      rule.apply === "hidden" && settings[rule.influence_field] === rule.when,
  );
}

function coerceValue(
  field: ChannexChannelParameter,
  value: string | boolean,
): ChannexSettingValue {
  if (field.type === "boolean" || field.type === "switch")
    return Boolean(value);
  if (field.type === "integer" || field.type === "number") {
    return value === "" ? "" : Number(value);
  }
  return String(value);
}

export function ChannexChannelWizard({
  provider,
  onClose,
  onFallback,
  prepare,
  create,
  activate,
  isPreparing,
  isCreating,
  isActivating,
}: ChannexChannelWizardProps) {
  const [settings, setSettings] = useState<Record<string, ChannexSettingValue>>(
    () => initialSettings(provider.parameters),
  );
  const [prepared, setPrepared] = useState<ChannexChannelPrepareResult | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [selectedRates, setSelectedRates] = useState<Record<string, string>>(
    {},
  );
  const [occupancies, setOccupancies] = useState<Record<string, number>>({});
  const [created, setCreated] = useState<ChannexChannelCreateResult | null>(
    null,
  );

  const remoteRates = useMemo(
    () => flattenRemoteRates(prepared?.mappingDetails),
    [prepared?.mappingDetails],
  );

  const visibleFields = provider.parameters.filter(
    (field) => !isFieldHidden(field, settings),
  );

  const handlePrepare = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const submittedSettings = Object.fromEntries(
        Object.entries(settings).filter(([, value]) => value !== ""),
      );
      const result = await prepare({
        channel: provider.code,
        settings: submittedSettings,
      });
      if (!result.supported) {
        await onFallback();
        return;
      }
      setPrepared(result);
      setTitle(`${provider.title} — ${result.propertyTitle ?? "Khách sạn"}`);
    } catch (error: unknown) {
      await showErrorAlert("Không thể kiểm tra kết nối", error);
    }
  };

  const handleCreate = async () => {
    if (!prepared?.localRatePlans?.length) return;
    const ratePlans = prepared.localRatePlans.flatMap((localRatePlan) => {
      const remote = remoteRates.find(
        (item) => item.key === selectedRates[localRatePlan.id],
      );
      if (!remote) return [];
      const occupancy = resolveRateOccupancy(
        remote,
        occupancies[localRatePlan.id] ?? localRatePlan.occupancy,
      );
      return [
        {
          rate_plan_id: localRatePlan.id,
          settings: {
            ...buildRateMappingSettings(
              prepared.adapter.rateParameters,
              remote,
              occupancy,
            ),
            ...Object.fromEntries(
              prepared.adapter.rateParameters.flatMap((field) =>
                !COMMON_NATIVE_RATE_FIELDS.has(field.key) &&
                field.default !== undefined
                  ? [[field.key, field.default]]
                  : [],
              ),
            ),
          },
        },
      ];
    });
    if (!ratePlans.length) {
      await showErrorAlert(
        "Chưa ánh xạ",
        "Hãy ánh xạ ít nhất một gói giá VietSage với rate OTA.",
      );
      return;
    }

    try {
      const submittedSettings = Object.fromEntries(
        Object.entries(settings).filter(([, value]) => value !== ""),
      );
      const result = await create({
        channel: provider.code,
        title,
        settings: submittedSettings,
        ratePlans,
      });
      setSettings(initialSettings(provider.parameters));
      setCreated(result);
      await showSuccessAlert(
        "Đã tạo kênh ở trạng thái tắt",
        result.ready
          ? "Readiness check đã đạt. Hãy kiểm tra lần cuối trước khi kích hoạt."
          : `Còn ${result.issues.length} vấn đề cần xử lý trước khi kích hoạt.`,
      );
    } catch (error: unknown) {
      await showErrorAlert("Không thể tạo kênh OTA", error);
    }
  };

  const handleActivate = async () => {
    if (!created?.channelId || !created.ready) return;
    const confirmation = await showConfirmDialog({
      title: `Kích hoạt ${provider.title}?`,
      text: "Kênh sẽ bắt đầu trao đổi tồn phòng, giá và booking thật với OTA.",
      confirmText: "Kích hoạt",
      cancelText: "Chưa kích hoạt",
      icon: "warning",
    });
    if (!confirmation.isConfirmed) return;

    try {
      await activate(created.channelId);
      await showSuccessAlert(
        "Đã kích hoạt kênh",
        `${provider.title} đã bắt đầu đồng bộ với Channex.`,
      );
      onClose();
    } catch (error: unknown) {
      await showErrorAlert("Không thể kích hoạt kênh", error);
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="channex-wizard-title"
      className="rounded-2xl border border-[var(--outline-variant)] bg-white shadow-lg"
    >
      <header className="flex flex-col gap-4 border-b border-[var(--outline-variant)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[var(--secondary)]">
            Thiết lập native
          </p>
          <h2
            id="channex-wizard-title"
            className="mt-1 text-2xl font-bold text-[var(--on-surface)]"
          >
            {provider.title}
          </h2>
          <p className="mt-1 text-base text-[var(--on-surface-variant)]">
            Kiểm tra thông tin, ánh xạ rate, tạo inactive, rồi mới kích hoạt.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-[var(--outline-variant)] px-5 text-base font-bold"
        >
          Đóng
        </button>
      </header>

      {!prepared ? (
        <form onSubmit={handlePrepare} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {visibleFields.map((field) => {
              const value = settings[field.key] ?? "";
              if (field.type === "boolean" || field.type === "switch") {
                return (
                  <label
                    key={field.key}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--outline-variant)] p-3 text-base font-semibold"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]: event.target.checked,
                        }))
                      }
                      className="h-5 w-5"
                    />
                    {field.title ?? field.key}
                  </label>
                );
              }
              return (
                <label
                  key={field.key}
                  className="text-base font-semibold text-[var(--on-surface)]"
                >
                  {field.title ?? field.key}
                  {field.type === "select" ? (
                    <select
                      value={String(value)}
                      required
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base"
                    >
                      <option value="">Chọn giá trị</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === "password" ? "password" : "text"}
                      inputMode={
                        field.type === "integer" || field.type === "number"
                          ? "numeric"
                          : undefined
                      }
                      value={String(value)}
                      required
                      autoComplete={
                        field.type === "password" ? "off" : undefined
                      }
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]: coerceValue(field, event.target.value),
                        }))
                      }
                      className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base"
                    />
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPreparing}
              className="min-h-11 rounded-xl bg-[var(--primary)] px-6 text-base font-bold text-white disabled:opacity-50"
            >
              {isPreparing ? "Đang kiểm tra..." : "Kiểm tra và tải mapping"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-base font-semibold">
              Tên kết nối
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-[var(--outline-variant)] px-4 text-base"
              />
            </label>
            <label className="text-base font-semibold">
              Tiền tệ
              <input
                value={prepared.currency ?? "VND"}
                readOnly
                className="mt-1 min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 text-base"
              />
            </label>
          </div>

          {remoteRates.length ? (
            <div className="space-y-3">
              <h3 className="text-xl font-bold">Ánh xạ gói giá</h3>
              {prepared.localRatePlans?.map((localRatePlan) => {
                const selected = remoteRates.find(
                  (item) => item.key === selectedRates[localRatePlan.id],
                );
                const occupancyOptions = selected?.occupancies.length
                  ? selected.occupancies
                  : [selected?.maxPersons ?? localRatePlan.occupancy ?? 1];
                const selectedOccupancy = selected
                  ? resolveRateOccupancy(
                      selected,
                      occupancies[localRatePlan.id] ?? localRatePlan.occupancy,
                    )
                  : occupancyOptions.at(-1);
                return (
                  <div
                    key={localRatePlan.id}
                    className="grid gap-3 rounded-xl border border-[var(--outline-variant)] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px] lg:items-end"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--on-surface-variant)]">
                        VietSage / Channex
                      </p>
                      <p className="text-base font-bold">
                        {localRatePlan.title}
                      </p>
                    </div>
                    <label className="text-base font-semibold">
                      Rate OTA
                      <select
                        value={selectedRates[localRatePlan.id] ?? ""}
                        onChange={(event) => {
                          setSelectedRates((current) => ({
                            ...current,
                            [localRatePlan.id]: event.target.value,
                          }));
                          setOccupancies((current) => {
                            const next = { ...current };
                            delete next[localRatePlan.id];
                            return next;
                          });
                        }}
                        className="mt-1 min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-3 text-base"
                      >
                        <option value="">Không map</option>
                        {remoteRates.map((remoteRate) => (
                          <option key={remoteRate.key} value={remoteRate.key}>
                            {remoteRate.roomTitle} — {remoteRate.rateTitle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-base font-semibold">
                      Số khách
                      <select
                        disabled={!selected}
                        value={selectedOccupancy}
                        onChange={(event) =>
                          setOccupancies((current) => ({
                            ...current,
                            [localRatePlan.id]: Number(event.target.value),
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-3 text-base disabled:opacity-50"
                      >
                        {occupancyOptions.map((occupancy) => (
                          <option key={occupancy} value={occupancy}>
                            {occupancy}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950">
              Channex không trả về cấu trúc room/rate chuẩn. Dùng màn hình
              Channex cho adapter này.
              <button
                type="button"
                onClick={() => void onFallback()}
                className="ml-3 min-h-11 rounded-xl bg-amber-900 px-4 font-bold text-white"
              >
                Mở Channex
              </button>
            </div>
          )}

          {created ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-lg font-bold text-emerald-950">
                Kênh đã tạo — chưa kích hoạt
              </p>
              <p className="mt-1 text-base text-emerald-900">
                {created.ready
                  ? "Readiness check đạt. Có thể kích hoạt."
                  : `Còn ${created.issues.length} vấn đề cần xử lý.`}
              </p>
              {created.ready && (
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={isActivating}
                  className="mt-4 min-h-11 rounded-xl bg-emerald-800 px-6 text-base font-bold text-white disabled:opacity-50"
                >
                  {isActivating ? "Đang kích hoạt..." : "Kích hoạt kênh"}
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPrepared(null)}
                className="min-h-11 rounded-xl border border-[var(--outline-variant)] px-5 text-base font-bold"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !remoteRates.length}
                className="min-h-11 rounded-xl bg-[var(--primary)] px-6 text-base font-bold text-white disabled:opacity-50"
              >
                {isCreating ? "Đang tạo..." : "Tạo kênh inactive"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
