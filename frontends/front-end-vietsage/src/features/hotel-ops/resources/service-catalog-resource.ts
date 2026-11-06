import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import {
  serviceCatalogRepository,
  type ServiceCatalogScope, type SaveServiceCategoryInput, type SaveServiceItemInput,
} from "../repositories/service-catalog-repository";

export const serviceCatalogResource = createResource<ServiceCatalogScope>()({
  namespace: ["vietsage"],
  name: "service-catalog",
  scopeKey: ({ hotelId, surface }) => ["hotel", hotelId, "surface", surface],
  queries: {
    categories: defineQuery({
      inputKey: (_input: undefined) => [],
      queryFn: ({ scope, signal }) => serviceCatalogRepository.categories(scope, signal),
    }),
    items: defineQuery({
      inputKey: (_input: undefined) => [],
      queryFn: ({ scope, signal }) => serviceCatalogRepository.items(scope, signal),
    }),
  },
  mutations: {
    saveCategory: defineMutation({
      mutationFn: ({ scope, variables }: { scope: ServiceCatalogScope; variables: SaveServiceCategoryInput }) => serviceCatalogRepository.saveCategory(scope, variables),
    }),
    saveItem: defineMutation({
      mutationFn: ({ scope, variables }: { scope: ServiceCatalogScope; variables: SaveServiceItemInput }) => serviceCatalogRepository.saveItem(scope, variables),
    }),
  },
});
