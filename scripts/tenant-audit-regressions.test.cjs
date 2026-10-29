const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontends/front-end-vietsage');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const ts = requireFrontend('typescript');
const React = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
const Link = ({ children, prefetch, ...props }) => React.createElement('a', props, children);
const VsIcon = () => null;

function load(relative, mocks = {}) {
  const file = path.join(frontend, 'src', relative);
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('.') || name.startsWith('@/')) throw new Error(`Unmocked dependency: ${name}`);
    return requireFrontend(name);
  }, module, module.exports);
  return module.exports;
}

test('mobile shell keeps every permitted destination reachable exactly once', () => {
  const { WorkspaceShell } = load('features/workspace/components/workspace-shell.tsx', {
    'next/link': Link,
    'next/navigation': { usePathname: () => '/owner/hotels/h/rooms', useSearchParams: () => new URLSearchParams() },
    '@/app/(vietsage)/_components/vs-dashboard-sidebar': { VsDashboardSidebar: () => null },
    '@/app/(vietsage)/_components/vs-top-bar': { VsTopBar: () => null },
    '@/app/(vietsage)/_components/vs-icon': { VsIcon },
    '@/features/workspace/utils/workspace-nav-active': { isNavItemActive: (href, active) => href === active },
    '@/features/hotel-ops/hooks/use-hotel-message-unread': { useHotelMessageUnread: () => ({ unreadCount: 2 }) },
    '../store/workspace-ui-store': { useWorkspaceUIStore: (selector) => selector({ isSidebarCollapsed: false, toggleSidebar() {} }) },
    './workspace-profile-context': { useWorkspaceProfile: () => ({ accessibleHotels: [] }) },
  });
  for (const count of [1, 4, 12]) {
    const navItems = Array.from({ length: count }, (_, i) => ({ key: `item-${i}`, label: `Destination ${i}`, href: `/destination-${i}`, icon: 'hotel' }));
    const html = renderToStaticMarkup(React.createElement(WorkspaceShell, {
      definition: { profileLabel: 'Owner' }, navItems,
    }, 'Content'));
    for (const item of navItems) assert.equal(html.split(`href="${item.href}"`).length - 1, 1);
    assert.equal(html.includes('<details'), count > 4);
  }
});

test('owner dashboard distinguishes failed debt retrieval from confirmed zero debt', async () => {
  let unavailable = true;
  const { default: Dashboard } = load('app/(vietsage)/owner/(global)/dashboard/page.tsx', {
    'next/link': Link, 'next/navigation': { notFound() { throw new Error('not found'); } },
    '@/auth': { auth: async () => ({}) },
    '@/features/workspace/config/workspace-registry': { resolveWorkspacePersona: () => 'owner' },
    '@/libs/server-session-tokens': { readServerSessionTokens: async () => ({ accessToken: 'test' }) },
    '@/libs/server-api-auth': { createAuthorizedApiExecutor: () => async (_label, action) => action('test') },
    '@/libs/server-workspace-context': { loadServerWorkspaceContext: async () => ({ activeRole: { code: 'TENANT_OWNER' }, accessibleHotels: [{ id: 'h', name: 'Hotel' }] }) },
    '@/features/hotel-ops/service/hotel-ops-service-instance': { hotelOpsService: { getDashboard: async () => ({
      generatedAt: '2026-10-29T00:00:00Z', rooms: { total: 1, occupied: 0, occupancyRate: 0 },
      revenue: { available: true, today: 0, last7Days: 0, currentMonth: 0 },
      stays: { activeStays: 0, todayCheckIns: 0, todayCheckOuts: 0, pendingCheckOuts: 0 }, requests: { unprocessed: 0 },
    }) } },
    '@/features/service-portal/service-client': { servicePortalClient: { hotelMarketplaceRevenue: async () => null } },
    '@/features/billing/service/billing-service-instance': { billingService: { getPlatformBillingAnalytics: async () => {
      if (unavailable) throw new Error('API unavailable');
      return { hasContract: true, debtSummary: { totalOutstandingAmount: 0 }, estimatedFee: 0 };
    } } },
    '../../../_components/vs-icon': { VsIcon },
    './animated-dashboard-number': { AnimatedDashboardNumber: ({ value }) => React.createElement('span', null, value) },
  });
  const failed = renderToStaticMarkup(await Dashboard({}));
  assert.match(failed, /Chưa xác minh/);
  assert.doesNotMatch(failed, /Đã tất toán|Không có nợ đọng/);
  unavailable = false;
  const loaded = renderToStaticMarkup(await Dashboard({}));
  assert.match(loaded, /Đã tất toán/);
  assert.doesNotMatch(loaded, /Không thể tải công nợ/);
});

test('shared invoice classification and request date filters preserve both callers', () => {
  const { isExternalInvoiceItem, labelStatus } = load('features/billing/utils/invoice-display.ts');
  assert.equal(isExternalInvoiceItem({ type: 'ROOM_CHARGE', serviceSource: 'EXTERNAL' }), false);
  assert.equal(isExternalInvoiceItem({ type: 'SERVICE', serviceSource: 'EXTERNAL' }), true);
  assert.equal(isExternalInvoiceItem({ type: 'SERVICE', name: 'Nước suối', partnerName: 'Khách sạn' }), false);
  assert.equal(labelStatus({ PAID: 'Đã thanh toán' }, 'PAID'), 'Đã thanh toán');
  const { normalizeDayFilter } = load('features/hotel-ops/utils/request-date-filter.ts');
  assert.equal(normalizeDayFilter(undefined, 'start'), undefined);
  assert.equal(normalizeDayFilter('29/10/2026', 'end'), '2026-10-29T23:59:59.999Z');
  assert.equal(normalizeDayFilter('2026-10-29T07:00:00+07:00', 'start'), '2026-10-29T07:00:00+07:00');
});

test('UI gate rejects decimal Tailwind and CSS microfonts without rejecting the floor', () => {
  const vm = require('node:vm');
  const gate = fs.readFileSync(path.join(__dirname, 'verify-ui-rules.cjs'), 'utf8');
  for (const [filename, content, expected] of [
    ['sample.tsx', '<span className="text-[10.5px]">Label</span>', 1],
    ['sample.tsx', '<span className="text-[0.74rem]">Label</span>', 1],
    ['sample.css', '.label { font-size: 11.5px; }', 1],
    ['sample.css', '.label { font-size: .7rem; }', 1],
    ['sample.tsx', '<span className="text-[12px]">Label</span>', 0],
    ['sample.css', '.label { font-size: 0.875rem; }', 0],
  ]) {
    const stop = {};
    let code;
    const fakeFs = {
      existsSync: () => true,
      readdirSync: () => [{ name: filename, isDirectory: () => false }],
      readFileSync: () => content,
    };
    try {
      vm.runInNewContext(gate, {
        __dirname, require: (name) => name === 'node:fs' ? fakeFs : require(name),
        process: { argv: [], exit: (value) => { code = value; throw stop; } },
        console: { log() {}, error() {} },
      });
    } catch (error) { if (error !== stop) throw error; }
    assert.equal(code, expected, `${filename}: ${content}`);
  }
});

test('catalog aggregation retrieves records after 100 and rejects incomplete results', async () => {
  const { collectCatalogPages, getOwnerSettingsTabs } = load('features/owner/utils/owner-settings.ts');
  const calls = [];
  const records = Array.from({ length: 201 }, (_, id) => ({ id }));
  const items = await collectCatalogPages(async (page) => {
    calls.push(page);
    return { items: records.slice((page - 1) * 100, page * 100), total: 201, limit: 100 };
  });
  assert.equal(items.length, 201);
  assert.equal(items[200].id, 200);
  assert.deepEqual(calls, [1, 2, 3]);
  await assert.rejects(collectCatalogPages(async () => ({ items: [], total: 101, limit: 100 })), /tải lại/);
  assert.deepEqual(getOwnerSettingsTabs(['hotel.staff.view']), ['staff']);
  assert.deepEqual(getOwnerSettingsTabs(['hotel.reservations.view']), ['confirmation-template']);
  assert.deepEqual(getOwnerSettingsTabs([]), []);
});

test('staff-only owner settings avoids requests for forbidden room and service APIs', async () => {
  const helpers = load('features/owner/utils/owner-settings.ts');
  const forbidden = () => { throw new Error('Forbidden API must not be called'); };
  const { default: SettingsPage } = load('app/(vietsage)/owner/(hotel)/hotels/[hotelId]/settings/page.tsx', {
    'next/navigation': { notFound: forbidden, redirect: forbidden },
    '@/auth': { auth: async () => ({}) },
    '@/core/http/http-error': { HttpError: class HttpError extends Error {} },
    '@/features/admin/service/admin-service-instance': { adminService: { getHotel: async (id) => ({ id, tenantId: 'tenant-1' }), listHotels: forbidden } },
    '@/features/hotel-ops/service/hotel-ops-service-instance': { hotelOpsService: { listRooms: forbidden, listServiceCategories: forbidden, listServiceItems: forbidden } },
    '@/libs/server-api-auth': { createAuthorizedApiExecutor: () => async (_label, action) => action('test') },
    '@/libs/server-workspace-context': { loadServerWorkspaceContext: async () => ({ permissions: ['hotel.profile.view', 'hotel.staff.view'], accessibleHotels: [{ id: 'h', tenantId: 'tenant-1' }] }) },
    '@/app/(vietsage)/owner/_components/owner-auth': { ownerAccessMessage: forbidden },
    '@/features/owner/utils/owner-settings': helpers,
    './owner-hotel-settings-client': { OwnerHotelSettingsClient: () => null },
  });
  const page = await SettingsPage({ params: Promise.resolve({ hotelId: 'h' }), searchParams: Promise.resolve({ tab: 'staff' }) });
  assert.equal(page.props.activeTab, 'staff');
  assert.equal(page.props.canManageTemplate, false);
  assert.equal(page.props.canManageServices, false);
  assert.equal(page.props.tenantId, 'tenant-1');
  assert.deepEqual(page.props.initialItems, []);
});

test('both catalog BFFs aggregate all pages and reject invalid pagination', async () => {
  const helpers = load('features/owner/utils/owner-settings.ts');
  for (const [route, method] of [['service-categories', 'listServiceCategories'], ['service-items', 'listServiceItems']]) {
    let calls = 0;
    const records = Array.from({ length: 101 }, (_, id) => ({ id }));
    const { GET } = load(`app/api/owner/hotels/[hotelId]/${route}/route.ts`, {
      '@/features/owner/utils/owner-settings': helpers,
      '@/core/http/http-error': { HttpError: class HttpError extends Error {} },
      '@/features/hotel-ops/service/hotel-ops-service-instance': { hotelOpsService: { [method]: async (_id, { query }) => {
        calls++;
        return { items: records.slice((query.page - 1) * query.limit, query.page * query.limit), total: records.length, limit: query.limit };
      } } },
      '../../../_utils': {
        executeOwnerBackendRequest: async (_label, action) => action('test'),
        successResponse: (data) => ({ status: 200, data }),
        validationErrorResponse: () => ({ status: 400 }),
        unknownServerErrorResponse: () => ({ status: 500 }), ownerHttpErrorResponse: () => ({ status: 403 }),
      },
    });
    const context = { params: Promise.resolve({ hotelId: 'h' }) };
    const response = await GET(new Request('https://example.test/catalog'), context);
    assert.equal(response.status, 200);
    assert.equal(response.data.items.length, 101);
    assert.equal(calls, 2);
    const invalid = await GET(new Request('https://example.test/catalog?page=1.5'), context);
    assert.equal(invalid.status, 400);
    assert.equal(calls, 2);
  }
});

test('confirmation template viewers receive disabled fields and no save action', () => {
  const { HotelConfirmationTemplateForm } = load('features/hotel-ops/components/booking-confirmation-modal.tsx', {
    '@tanstack/react-query': {
      useQuery: () => ({ data: null, isLoading: false }),
      useMutation: () => ({ isPending: false }),
      useQueryClient: () => ({ invalidateQueries() {} }),
    },
    '@/app/(vietsage)/_components/vs-icon': { VsIcon },
    '@/features/hotel-ops/resources/staff-rooms-resource': { staffRoomsResource: {
      queries: { confirmationTemplate: { options: () => ({}) } },
      bind: () => ({ mutations: { upsertConfirmationTemplate: { options: () => ({}) } } }),
    } },
    '@/libs/swal': { showErrorAlert() {}, showSuccessAlert() {} },
  });
  const viewer = renderToStaticMarkup(React.createElement(HotelConfirmationTemplateForm, { hotelId: 'h', canManage: false }));
  assert.doesNotMatch(viewer, /type="submit"/);
  assert.match(viewer, /disabled=""/);
  const manager = renderToStaticMarkup(React.createElement(HotelConfirmationTemplateForm, { hotelId: 'h', canManage: true }));
  assert.match(manager, /type="submit"/);
});
