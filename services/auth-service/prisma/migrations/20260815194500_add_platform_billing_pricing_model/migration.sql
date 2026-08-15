ALTER TABLE "PlatformBillingContractRevision"
ADD COLUMN "pricingModel" VARCHAR(16) NOT NULL DEFAULT 'FIXED';

ALTER TABLE "PlatformBillingContractRevision"
ADD CONSTRAINT "PlatformBillingContractRevision_pricingModel_check"
CHECK ("pricingModel" IN ('FIXED', 'PERCENTAGE'));
