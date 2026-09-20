import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("tenant owner excel export and unified status contract", () => {
  const clientPath = path.join(
    rootDir,
    "frontends/front-end-vietsage/src/app/(vietsage)/admin/users/tenant-owners-client.tsx",
  );
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  // 1. Verify Excel columns do not have redundant "Trạng thái người dùng"
  assert.doesNotMatch(clientContent, /\{ header: "Trạng thái người dùng", key: "status" \}/);

  // 2. Verify Excel columns have "Trạng thái tổ chức"
  assert.match(clientContent, /\{ header: "Trạng thái tổ chức", key: "tenantUserStatus" \}/);

  // 3. Verify unified status in edit dialog
  assert.match(clientContent, /Trạng thái tổ chức/);
  assert.match(clientContent, /Vô hiệu hóa \(Khóa tài khoản (&|&amp;) tổ chức\)/);

  // 4. Verify backend cascading lock in tenant-owners.service.ts
  const servicePath = path.join(
    rootDir,
    "services/auth-service/src/modules/organization/application/tenant-owners.service.ts",
  );
  const serviceContent = fs.readFileSync(servicePath, "utf-8");
  assert.match(serviceContent, /shouldLock/);
  assert.match(serviceContent, /TenantUserStatus\.DISABLED/);
  assert.match(serviceContent, /UserStatus\.LOCKED/);
});
