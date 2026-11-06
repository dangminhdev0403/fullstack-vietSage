import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";
import * as queryResource from "@dangminhdev04032005/query-resource";

const require = createRequire(import.meta.url);
function loadSource(relative, imports) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => name in imports ? imports[name] : name === "@dangminhdev04032005/query-resource" ? queryResource : require(name), exports);
  return exports;
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls = [];
  let saved = { id: "category", name: "Updated" };
  const repository = loadSource("./repositories/service-catalog-repository.ts", {
    "@/core/http/internal-api-client": { requestInternalApi: async (path, options) => {
      calls.push({ path, options });
      return options.method === "GET" ? { items: [saved] } : saved;
    } },
  });
  const { serviceCatalogResource } = loadSource("./resources/service-catalog-resource.ts", {
    "../repositories/service-catalog-repository": repository,
  });
  const { useServiceCatalog } = loadSource("./hooks/use-service-catalog.ts", {
    "../resources/service-catalog-resource": { serviceCatalogResource },
    "@tanstack/react-query": {
      useQueryClient: () => client,
      useQuery: (options) => {
        if (client.getQueryData(options.queryKey) === undefined) client.setQueryData(options.queryKey, options.initialData);
        return { data: client.getQueryData(options.queryKey) };
      },
      useMutation: (options) => ({ mutateAsync: async (variables) => {
        const context = { client };
        const data = await options.mutationFn(variables, context);
        await options.onSuccess?.(data, variables, undefined, context);
        return data;
      } }),
    },
  });
  return { client, calls, repository: repository.serviceCatalogRepository, serviceCatalogResource, useServiceCatalog,
    save: (value) => { saved = value; } };
}

test("catalog keys isolate hotels and owner/staff surfaces", () => {
  const { serviceCatalogResource: resource, client } = setup();
  const owner = resource.bind({ hotelId: "one", surface: "owner" });
  const staff = resource.bind({ hotelId: "one", surface: "hotel-ops" });
  const other = resource.bind({ hotelId: "two", surface: "owner" });
  owner.queries.categories.set(client, undefined, [{ id: "category" }]);
  assert.equal(staff.queries.categories.get(client, undefined), undefined);
  assert.equal(other.queries.categories.get(client, undefined), undefined);
  client.clear();
});

test("repository preserves endpoint, write body, method and cancellation", async () => {
  const { repository, calls, client } = setup();
  const scope = { hotelId: "hotel/one", surface: "owner" };
  const signal = new AbortController().signal;
  await repository.categories(scope, signal);
  assert.equal(calls[0].path, "/api/owner/hotels/hotel%2Fone/service-categories");
  assert.equal(calls[0].options.signal, signal);
  const input = { defaultPrice: 0, priceUpdateMode: "OVERRIDE_ALL_ITEMS" };
  await repository.saveCategory(scope, { id: "cat/one", input });
  assert.equal(calls[1].path, "/api/owner/hotels/hotel%2Fone/service-categories/cat%2Fone");
  assert.equal(calls[1].options.method, "PATCH");
  assert.equal(calls[1].options.body, input);
  await repository.saveItem({ ...scope, surface: "hotel-ops" }, { input: { name: "Item", categoryId: "category" } });
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].path, "/api/hotel-ops/hotels/hotel%2Fone/service-items");
  client.clear();
});

test("successful writes replace or insert once in the shared scoped cache", async () => {
  const { client, useServiceCatalog, serviceCatalogResource: resource, save } = setup();
  const scope = { hotelId: "one", surface: "owner" };
  const catalog = useServiceCatalog(scope, [{ id: "category", name: "Old" }], []);
  const bound = resource.bind(scope);
  await catalog.saveCategory.mutateAsync({ id: "category", input: { name: "Updated" } });
  assert.deepEqual(bound.queries.categories.get(client, undefined), [{ id: "category", name: "Updated" }]);
  save({ id: "new", name: "New" });
  await catalog.saveCategory.mutateAsync({ input: { name: "New" } });
  await catalog.saveCategory.mutateAsync({ id: "new", input: { name: "New" } });
  assert.deepEqual(bound.queries.categories.get(client, undefined).map((item) => item.id), ["new", "category"]);
  assert.equal(resource.bind({ hotelId: "two", surface: "owner" }).queries.categories.get(client, undefined), undefined);
  client.clear();
});

test("explicit refresh fetches despite fresh cached data and updates both collections", async () => {
  const { client, useServiceCatalog, calls, save, serviceCatalogResource: resource } = setup();
  const scope = { hotelId: "one", surface: "owner" };
  const catalog = useServiceCatalog(scope, [{ id: "old" }], [{ id: "old-item" }]);
  save({ id: "fresh" });
  await catalog.refresh();
  assert.equal(calls.length, 2);
  assert.deepEqual(resource.bind(scope).queries.categories.get(client, undefined), [{ id: "fresh" }]);
  assert.deepEqual(resource.bind(scope).queries.items.get(client, undefined), [{ id: "fresh" }]);
  client.clear();
});
