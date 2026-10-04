import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import * as repo from "./admin-channel-manager.repository.ts";

test("query allowlist: accepts and encodes only valid query parameters", () => {
  const input = {
    q: "  Grand Hotel & Spa  ",
    state: "ACTIVE" as const,
    page: 2,
    limit: 50,
    // Disallowed / extraneous parameters
    secretToken: "secret_123",
    providerKey: "pk_live_xyz",
    internalFlag: true,
  };

  const queryString = repo.buildOverviewQueryString(input);
  const searchParams = new URLSearchParams(queryString);

  assert.equal(searchParams.get("q"), "Grand Hotel & Spa");
  assert.equal(searchParams.get("state"), "ACTIVE");
  assert.equal(searchParams.get("page"), "2");
  assert.equal(searchParams.get("limit"), "50");

  assert.equal(searchParams.get("secretToken"), null);
  assert.equal(searchParams.get("providerKey"), null);
  assert.equal(searchParams.get("internalFlag"), null);
});

test("query allowlist: strips empty query, invalid states, and bounds page/limit with Number.isFinite", () => {
  const input = {
    q: "   ",
    state: "INVALID_STATE" as unknown as repo.AdminChannelOverviewState,
    page: -5,
    limit: 500,
  };

  const sanitized = repo.sanitizeOverviewQuery(input);
  assert.equal(sanitized.q, undefined);
  assert.equal(sanitized.state, undefined);
  assert.equal(sanitized.page, undefined);
  assert.equal(sanitized.limit, 100); // Clamped to 100 max

  // Non-finite numbers (Infinity, -Infinity, NaN) must be rejected
  const nonFiniteInput = {
    page: Infinity,
    limit: -Infinity,
  };
  const sanitizedNonFinite = repo.sanitizeOverviewQuery(nonFiniteInput);
  assert.equal(sanitizedNonFinite.page, undefined);
  assert.equal(sanitizedNonFinite.limit, undefined);

  const nanInput = {
    page: NaN,
    limit: "invalid-number" as unknown as number,
  };
  const sanitizedNan = repo.sanitizeOverviewQuery(nanInput);
  assert.equal(sanitizedNan.page, undefined);
  assert.equal(sanitizedNan.limit, undefined);
});

test("response mapping: maps all five friendly states and action labels", () => {
  const states = [
    {
      state: "UNCONFIGURED",
      issue: "PROPERTY_MISSING",
      expectedLabel: "Chưa thiết lập",
      expectedAction: "Liên kết Channex",
    },
    {
      state: "SETTING_UP",
      issue: "MAPPING_INCOMPLETE",
      expectedLabel: "Đang thiết lập",
      expectedAction: "Ghép phòng & gói giá",
    },
    {
      state: "ACTIVE",
      issue: null,
      expectedLabel: "Hoạt động",
      expectedAction: "Quản lý kênh",
    },
    {
      state: "ATTENTION",
      issue: "RECONCILIATION_REQUIRED",
      expectedLabel: "Cần chú ý",
      expectedAction: "Xử lý đối soát",
    },
    {
      state: "INTERRUPTED",
      issue: "SYNC_FAILED",
      expectedLabel: "Gián đoạn",
      expectedAction: "Kiểm tra kết nối",
    },
  ] as const;

  for (const s of states) {
    const raw = {
      hotelId: "h1",
      hotelCode: "H01",
      hotelName: "Khách Sạn 1",
      tenantId: "t1",
      tenantName: "Tenant A",
      state: s.state,
      primaryIssueCode: s.issue,
      propertyConfigured: s.state !== "UNCONFIGURED",
      mappedRoomTypes: s.state === "UNCONFIGURED" ? 0 : 2,
      mappedRatePlans: s.state === "UNCONFIGURED" ? 0 : 2,
      pendingReconciliations: s.state === "ATTENTION" ? 3 : 0,
      lastSyncAt: "2026-10-03T18:00:00Z",
      lastSyncStatus: s.state === "INTERRUPTED" ? "FAILED" : "SUCCESS",
    };

    const mapped = repo.mapAdminChannelOverviewItem(raw);
    assert.equal(mapped.state, s.state);
    assert.equal(mapped.primaryIssueCode, s.issue);
    assert.equal(repo.FRIENDLY_STATE_LABELS[mapped.state], s.expectedLabel);
    assert.equal(
      repo.getPrimaryActionLabel(mapped.state, mapped.primaryIssueCode),
      s.expectedAction,
    );
  }
});

test("response mapping: preserves pagination metadata exactly", () => {
  const rawResponse = {
    summary: {
      totalHotels: 55,
      configuredHotels: 40,
      activeHotels: 35,
      needsAttention: 5,
      unconfiguredHotels: 15,
      pendingReconciliations: 2,
    },
    items: [],
    page: 3,
    limit: 15,
    total: 55,
  };

  const mapped = repo.mapAdminChannelOverviewResponse(rawResponse);
  assert.equal(mapped.page, 3);
  assert.equal(mapped.limit, 15);
  assert.equal(mapped.total, 55);
  assert.equal(mapped.summary.totalHotels, 55);
  assert.equal(mapped.summary.configuredHotels, 40);
});

test("empty vs filtered-empty distinction: correctly distinguishes overall empty vs filtered empty with filtered summary contract", () => {
  // Case 1: Overall empty fleet (no query filters, totalHotels === 0)
  const emptyOverview = {
    summary: {
      totalHotels: 0,
      configuredHotels: 0,
      activeHotels: 0,
      needsAttention: 0,
      unconfiguredHotels: 0,
      pendingReconciliations: 0,
    },
    items: [],
    page: 1,
    limit: 25,
    total: 0,
  };

  assert.equal(repo.isEmptyFleet(emptyOverview), true);
  assert.equal(repo.isFilteredEmpty(emptyOverview), false);

  // Case 2: Filtered empty with backend filtered summary contract
  // When filter (e.g. q="Not Found" or state="INTERRUPTED") yields 0 matches,
  // the backend summary is computed FROM filtered, so summary.totalHotels === 0!
  const filteredZeroSummaryOverview = {
    summary: {
      totalHotels: 0,
      configuredHotels: 0,
      activeHotels: 0,
      needsAttention: 0,
      unconfiguredHotels: 0,
      pendingReconciliations: 0,
    },
    items: [],
    page: 1,
    limit: 25,
    total: 0,
  };

  const filterQuery = { q: "Non-existent hotel" };
  // Must NOT report overall empty when an active filter is present!
  assert.equal(repo.isEmptyFleet(filteredZeroSummaryOverview, filterQuery), false);
  assert.equal(repo.isFilteredEmpty(filteredZeroSummaryOverview, filterQuery), true);

  const stateFilterQuery = { state: "INTERRUPTED" as const };
  assert.equal(repo.isEmptyFleet(filteredZeroSummaryOverview, stateFilterQuery), false);
  assert.equal(repo.isFilteredEmpty(filteredZeroSummaryOverview, stateFilterQuery), true);

  // States must be strictly mutually exclusive
  assert.notEqual(
    repo.isEmptyFleet(filteredZeroSummaryOverview, filterQuery),
    repo.isFilteredEmpty(filteredZeroSummaryOverview, filterQuery),
  );
  assert.notEqual(
    repo.isEmptyFleet(emptyOverview),
    repo.isFilteredEmpty(emptyOverview),
  );

  // Case 3: Populated list (neither empty nor filtered empty)
  const populatedOverview = {
    summary: {
      totalHotels: 10,
      configuredHotels: 8,
      activeHotels: 7,
      needsAttention: 1,
      unconfiguredHotels: 2,
      pendingReconciliations: 0,
    },
    items: [
      {
        hotelId: "h1",
        hotelCode: "H01",
        hotelName: "Hotel One",
        tenantId: "t1",
        tenantName: "Tenant",
        state: "ACTIVE" as const,
        propertyConfigured: true,
        mappedRoomTypes: 1,
        mappedRatePlans: 1,
        pendingReconciliations: 0,
        lastSyncAt: null,
        lastSyncStatus: null,
        primaryIssueCode: null,
      },
    ],
    page: 1,
    limit: 25,
    total: 10,
  };

  assert.equal(repo.isEmptyFleet(populatedOverview), false);
  assert.equal(repo.isFilteredEmpty(populatedOverview), false);
  assert.equal(repo.isEmptyFleet(populatedOverview, filterQuery), false);
  assert.equal(repo.isFilteredEmpty(populatedOverview, filterQuery), false);
});

test("contextual tab selection: routes to the correct contextual tab based on hotel issue", () => {
  const baseItem = {
    hotelId: "h1",
    hotelCode: "H01",
    hotelName: "Hotel Test",
    tenantId: "t1",
    tenantName: "Tenant Test",
    state: "ACTIVE" as const,
    propertyConfigured: true,
    mappedRoomTypes: 2,
    mappedRatePlans: 2,
    pendingReconciliations: 0,
    lastSyncAt: null,
    lastSyncStatus: null,
    primaryIssueCode: null,
  };

  // PROPERTY_MISSING -> CONFIG
  assert.equal(
    repo.getContextualTab({
      ...baseItem,
      state: "UNCONFIGURED",
      propertyConfigured: false,
      primaryIssueCode: "PROPERTY_MISSING",
    }),
    "CONFIG",
  );

  // MAPPING_INCOMPLETE -> CHANNELS
  assert.equal(
    repo.getContextualTab({
      ...baseItem,
      state: "SETTING_UP",
      mappedRoomTypes: 0,
      primaryIssueCode: "MAPPING_INCOMPLETE",
    }),
    "CHANNELS",
  );

  // RECONCILIATION_REQUIRED -> REPAIR
  assert.equal(
    repo.getContextualTab({
      ...baseItem,
      state: "ATTENTION",
      pendingReconciliations: 3,
      primaryIssueCode: "RECONCILIATION_REQUIRED",
    }),
    "REPAIR",
  );

  // SYNC_FAILED -> REPAIR
  assert.equal(
    repo.getContextualTab({
      ...baseItem,
      state: "INTERRUPTED",
      primaryIssueCode: "SYNC_FAILED",
    }),
    "REPAIR",
  );

  // CONNECTION_INTERRUPTED -> REPAIR
  assert.equal(
    repo.getContextualTab({
      ...baseItem,
      state: "INTERRUPTED",
      primaryIssueCode: "CONNECTION_INTERRUPTED",
    }),
    "REPAIR",
  );

  // Active/Healthy -> OVERVIEW
  assert.equal(repo.getContextualTab(baseItem), "OVERVIEW");
});

test("security: raw provider fields are not projected to UI model", () => {
  const contaminatedItem = {
    hotelId: "hotel_safe_id",
    hotelCode: "SAFE01",
    hotelName: "Safe Hotel",
    tenantId: "tenant_safe_id",
    tenantName: "Safe Tenant",
    state: "ACTIVE",
    propertyConfigured: true,
    mappedRoomTypes: 2,
    mappedRatePlans: 2,
    pendingReconciliations: 0,
    lastSyncAt: null,
    lastSyncStatus: null,
    primaryIssueCode: null,
    // Sensitive / raw provider fields that must be stripped:
    providerApiToken: "secret_live_channex_token_abc123",
    webhookSecret: "whsec_super_secret_key",
    rawProviderError: { code: "AUTH_FAIL", raw: "invalid credentials" },
    databaseConnectionUrl: "postgres://user:pass@db:5432/core",
    internalDebugLog: "session dump 12345",
  };

  const mapped = repo.mapAdminChannelOverviewItem(contaminatedItem);
  const unsafeRecord = mapped as unknown as Record<string, unknown>;

  assert.equal(unsafeRecord.providerApiToken, undefined);
  assert.equal(unsafeRecord.webhookSecret, undefined);
  assert.equal(unsafeRecord.rawProviderError, undefined);
  assert.equal(unsafeRecord.databaseConnectionUrl, undefined);
  assert.equal(unsafeRecord.internalDebugLog, undefined);
  assert.equal(mapped.hotelId, "hotel_safe_id");
  assert.equal(mapped.hotelName, "Safe Hotel");
});

test("repository: getOverview invokes requester with sanitized query and maps output", async () => {
  let requestedPath = "";

  repo.setAdminChannelManagerRequester(async <T>(path: string) => {
    requestedPath = path;
    const mockData = {
      summary: {
        totalHotels: 1,
        configuredHotels: 1,
        activeHotels: 1,
        needsAttention: 0,
        unconfiguredHotels: 0,
        pendingReconciliations: 0,
      },
      items: [
        {
          hotelId: "h1",
          hotelCode: "H01",
          hotelName: "Test Hotel",
          tenantId: "t1",
          tenantName: "Test Tenant",
          state: "ACTIVE" as const,
          propertyConfigured: true,
          mappedRoomTypes: 1,
          mappedRatePlans: 1,
          pendingReconciliations: 0,
          lastSyncAt: null,
          lastSyncStatus: null,
          primaryIssueCode: null,
        },
      ],
      page: 1,
      limit: 25,
      total: 1,
    };
    return {
      data: mockData as unknown as T,
    };
  });

  const result = await repo.adminChannelManagerRepository.getOverview({
    q: "Test Hotel",
    state: "ACTIVE",
  });

  assert.equal(
    requestedPath,
    "/api/admin/channel-manager/overview?q=Test+Hotel&state=ACTIVE",
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].hotelName, "Test Hotel");

  // Reset custom requester
  repo.setAdminChannelManagerRequester(null);
});
