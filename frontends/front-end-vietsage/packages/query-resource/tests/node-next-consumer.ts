import {
  createResource,
  defineQuery,
  type ResourceQueryContext,
} from "@dangminhdev/query-resource";

type Scope = {
  tenantId: string;
};

const resource = createResource<Scope>()({
  namespace: ["consumer-test"],
  name: "items",
  scopeKey: (scope) => [scope.tenantId],
  queries: {
    detail: defineQuery({
      inputKey: (input: { id: string }) => [input.id],
      queryFn: async ({
        input,
      }: ResourceQueryContext<
        Scope,
        { id: string }
      >): Promise<{ id: string }> => ({ id: input.id }),
    }),
  },
});

resource.bind({ tenantId: "tenant-1" }).queries.detail.options({
  id: "item-1",
});
