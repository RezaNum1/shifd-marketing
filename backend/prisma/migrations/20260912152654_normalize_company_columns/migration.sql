/*
  Warnings:

  - You are about to drop the column `businessTypes` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `contextVersion` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `coreValueProposition` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `customerSegments` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `decisionMakers` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `painPoints` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `primaryMarket` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `reportingTimezone` on the `companies` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "companies" DROP COLUMN "businessTypes",
DROP COLUMN "contextVersion",
DROP COLUMN "coreValueProposition",
DROP COLUMN "customerSegments",
DROP COLUMN "decisionMakers",
DROP COLUMN "painPoints",
DROP COLUMN "primaryMarket",
DROP COLUMN "reportingTimezone",
ADD COLUMN     "business_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "context_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "core_value_proposition" TEXT,
ADD COLUMN     "customer_segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "decision_makers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pain_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primary_market" TEXT,
ADD COLUMN     "reporting_timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';
