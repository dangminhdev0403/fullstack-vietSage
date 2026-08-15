ALTER TABLE "ServiceTenantProfile"
ADD COLUMN "deliveryServiceFeeRate" DECIMAL(5, 2);

ALTER TABLE "ServiceTenantProfile"
ADD CONSTRAINT "ServiceTenantProfile_deliveryServiceFeeRate_check"
CHECK ("deliveryServiceFeeRate" IS NULL OR "deliveryServiceFeeRate" BETWEEN 0 AND 100);