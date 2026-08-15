import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Req } from "@nestjs/common";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ImportTemplateService } from "../../../common/import/import-template.service";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import { MarketplaceCategorySheetService } from "../application/marketplace-category-sheet.service";
import { MarketplaceCategoryImportAdapter } from "../infrastructure/imports/marketplace-category-import.adapter";
import {
  categorySheetCommitInputSchema,
  categorySheetInputSchema,
} from "../domain/marketplace-category-import.schema";
import {
  marketplaceCategoryBodySchema,
  marketplaceCategoryUpdateSchema,
  marketplaceIdSchema,
  marketplacePricingConfigSchema,
  serviceTenantBodySchema,
  serviceTenantUpdateSchema,
} from "../domain/marketplace-admin.schema";

@Controller("admin/marketplace")
export class MarketplaceAdminController {
  constructor(
    private readonly service: MarketplaceAdminService,
    private readonly sheetService: MarketplaceCategorySheetService,
    private readonly templateService: ImportTemplateService,
    private readonly categoryAdapter: MarketplaceCategoryImportAdapter,
  ) {}

  @RequirePermission("platform.marketplace.view")
  @SuccessMessage("Lấy danh mục Marketplace thành công")
  @ApiDescript("Xem danh mục Marketplace")
  @Get("categories")
  categories() {
    return this.service.listCategories();
  }

  @RequirePermission("platform.marketplace.view")
  @SuccessMessage("Lấy cấu hình phí Marketplace thành công")
  @ApiDescript("Xem cấu hình phí Marketplace")
  @Get("pricing-config")
  pricingConfig() {
    return this.service.getPricingConfig();
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Cập nhật cấu hình phí Marketplace thành công")
  @ApiDescript("Cập nhật cấu hình phí Marketplace")
  @Patch("pricing-config")
  updatePricingConfig(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.updatePricingConfig(
      req.user.userId,
      parseWithZod(marketplacePricingConfigSchema, body),
    );
  }

  @RequirePermission("platform.marketplace.manage")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="marketplace_categories_template.csv"')
  @ApiDescript("Tải file mẫu CSV danh mục Marketplace")
  @Get("categories/import/template")
  categoryImportTemplate() {
    const csvs = this.templateService.toCsvSheets(this.categoryAdapter.getSchema());
    return "\uFEFF" + (csvs.categories ?? "");
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Xem trước dữ liệu danh mục Google Sheets thành công")
  @ApiDescript("Xem trước dữ liệu danh mục Google Sheets Marketplace")
  @Post("categories/import/preview")
  previewCategoryImport(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    const parsed = parseWithZod(categorySheetInputSchema, body);
    return this.sheetService.preview(parsed.spreadsheetUrl, req.user.userId);
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Nhập danh mục từ Google Sheets thành công")
  @ApiDescript("Nhập danh mục từ Google Sheets Marketplace")
  @Post("categories/import/commit")
  commitCategoryImport(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    const parsed = parseWithZod(categorySheetCommitInputSchema, body);
    return this.sheetService.commit(parsed.spreadsheetUrl, parsed.expectedHash, req.user.userId);
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Tạo danh mục Marketplace thành công")
  @ApiDescript("Tạo danh mục Marketplace")
  @Post("categories")
  createCategory(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.createCategory(
      req.user.userId,
      parseWithZod(marketplaceCategoryBodySchema, body),
    );
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Cập nhật danh mục Marketplace thành công")
  @ApiDescript("Cập nhật danh mục Marketplace")
  @Patch("categories/:categoryId")
  updateCategory(
    @Req() req: RequestWithRequiredUser,
    @Param("categoryId") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateCategory(
      req.user.userId,
      parseWithZod(marketplaceIdSchema, id),
      parseWithZod(marketplaceCategoryUpdateSchema, body),
    );
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Xóa danh mục Marketplace thành công")
  @ApiDescript("Xóa hẳn (Hard delete) danh mục Marketplace")
  @Delete("categories/:categoryId")
  deleteCategory(@Req() req: RequestWithRequiredUser, @Param("categoryId") id: string) {
    return this.service.deleteCategory(req.user.userId, parseWithZod(marketplaceIdSchema, id));
  }

  @RequirePermission("platform.marketplace.view")
  @SuccessMessage("Lấy Service Tenant thành công")
  @ApiDescript("Xem Service Tenant Marketplace")
  @Get("service-tenants")
  serviceTenants() {
    return this.service.listServiceTenants();
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Tạo Service Tenant thành công")
  @ApiDescript("Tạo Service Tenant Marketplace")
  @Post("service-tenants")
  createServiceTenant(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.createServiceTenant(
      req.user.userId,
      parseWithZod(serviceTenantBodySchema, body),
    );
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Cập nhật Service Tenant thành công")
  @ApiDescript("Cập nhật Service Tenant Marketplace")
  @Patch("service-tenants/:tenantId")
  updateServiceTenant(
    @Req() req: RequestWithRequiredUser,
    @Param("tenantId") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateServiceTenant(
      req.user.userId,
      parseWithZod(marketplaceIdSchema, id),
      parseWithZod(serviceTenantUpdateSchema, body),
    );
  }
}
