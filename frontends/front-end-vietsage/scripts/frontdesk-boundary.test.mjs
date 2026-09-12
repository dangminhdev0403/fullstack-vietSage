import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const servicesPageSource = readFileSync(
  new URL(
    "../src/app/(vietsage)/hotels/[hotelId]/services/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const serviceCatalogClientSource = readFileSync(
  new URL(
    "../src/app/(vietsage)/hotels/[hotelId]/services/service-catalog-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

const partnersPageSource = readFileSync(
  new URL(
    "../src/app/(vietsage)/hotels/[hotelId]/partners/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const staffLocalPartnersClientSource = readFileSync(
  new URL(
    "../src/features/local-partners/components/staff-local-partners-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

const settlementsTabSource = readFileSync(
  new URL(
    "../src/features/local-partners/components/hotel-partner-settlements-tab.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("services page determines canManage via hotel.services.manage permission", () => {
  assert.match(
    servicesPageSource,
    /canManage\s*=\s*workspaceContext\.permissions\.includes\("hotel\.services\.manage"\)/,
  );
  assert.match(
    servicesPageSource,
    /<ServiceCatalogClient[\s\S]*?canManage=\{canManage\}/,
  );
});

test("service catalog client defaults canManage to false and restricts mutations", () => {
  assert.match(serviceCatalogClientSource, /canManage\s*=\s*false/);
  // Mutation handlers are guarded
  assert.match(
    serviceCatalogClientSource,
    /saveCategory[\s\S]*?if\s*\(!canManage/,
  );
  assert.match(
    serviceCatalogClientSource,
    /saveItem[\s\S]*?if\s*\(!canManage/,
  );
  assert.match(
    serviceCatalogClientSource,
    /toggleCategory[\s\S]*?if\s*\(!canManage/,
  );
  assert.match(
    serviceCatalogClientSource,
    /toggleItem[\s\S]*?if\s*\(!canManage/,
  );
  // Action columns and modal forms guarded by canManage
  assert.match(
    serviceCatalogClientSource,
    /categoryColumns[\s\S]*?canManage[\s\S]*?key:\s*"actions"/,
  );
  assert.match(
    serviceCatalogClientSource,
    /itemColumns[\s\S]*?canManage[\s\S]*?key:\s*"actions"/,
  );
  assert.match(
    serviceCatalogClientSource,
    /\{canManage\s*&&\s*categoryForm\s*\?/,
  );
  assert.match(
    serviceCatalogClientSource,
    /\{canManage\s*&&\s*itemForm\s*\?/,
  );
});

test("partners page determines canManage via hotel.local-partners.manage permission", () => {
  assert.match(
    partnersPageSource,
    /canManage\s*=\s*context\.permissions\.includes\("hotel\.local-partners\.manage"\)/,
  );
  assert.match(
    partnersPageSource,
    /<OwnerNearbyProvidersClient[\s\S]*?canManage=\{canManage\}/,
  );
});

test("staff local partners client disables management controls and propagates canManage", () => {
  // OwnerNearbyProvidersClient defaults canManage to false
  assert.match(
    staffLocalPartnersClientSource,
    /export function OwnerNearbyProvidersClient\([\s\S]*?canManage\s*=\s*false/,
  );
  // Settlements tab button is hidden when canManage is false
  assert.match(
    staffLocalPartnersClientSource,
    /\{canManage\s*\?\s*\([\s\S]*?Quyết toán công nợ đối tác[\s\S]*?\)\s*:\s*null\}/,
  );
  // HotelPartnerSettlementsTab receives canManage
  assert.match(
    staffLocalPartnersClientSource,
    /<HotelPartnerSettlementsTab[\s\S]*?canManage=\{canManage\}/,
  );
  // Modal details hides connect/disconnect when !canManage
  assert.match(
    staffLocalPartnersClientSource,
    /showCancelButton:\s*canManage/,
  );
  assert.match(
    staffLocalPartnersClientSource,
    /confirmButtonText:\s*canManage\s*\?[\s\S]*?:\s*"Đóng"/,
  );
  // Toggle provider connection is guarded
  assert.match(
    staffLocalPartnersClientSource,
    /async function toggle\(provider[\s\S]*?if\s*\(!canManage\)\s*return;/,
  );

  // StaffLocalPartnersClient defaults canManage to false and guards actions
  assert.match(
    staffLocalPartnersClientSource,
    /export function StaffLocalPartnersClient\([\s\S]*?canManage\s*=\s*false/,
  );
  assert.match(
    staffLocalPartnersClientSource,
    /canManage\s*&&\s*formOpen\s*\?/,
  );
});

test("hotel partner settlements tab preserves owner/finance defaults and protects mutations", () => {
  // canManage defaults to true for owner/finance direct compatibility
  assert.match(
    settlementsTabSource,
    /export function HotelPartnerSettlementsTab\([\s\S]*?canManage\s*=\s*true/,
  );
  // Settlement actions guarded
  assert.match(
    settlementsTabSource,
    /handleSettleSingle[\s\S]*?if\s*\(!canManage\)\s*return;/,
  );
  assert.match(
    settlementsTabSource,
    /handleSettleBatch[\s\S]*?if\s*\(!canManage\s*\|\|\s*selectedIds\.length\s*===\s*0\)\s*return;/,
  );
  // Actions column excluded when !canManage
  assert.match(
    settlementsTabSource,
    /\.\.\.\(canManage[\s\S]*?id:\s*"actions"/,
  );
  // DataTable selection disabled when !canManage
  assert.match(
    settlementsTabSource,
    /selection=\{[\s\S]*?canManage\s*&&\s*statusFilter\s*===\s*"UNSETTLED"/,
  );
});
