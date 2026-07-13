-- CreateEnum
CREATE TYPE "PointEntryType" AS ENUM ('EARN', 'REDEEM', 'REVERSE');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleReturn" ADD COLUMN     "pointsReversed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShopSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "earnAmount" DECIMAL(14,2) NOT NULL DEFAULT 100,
    "earnPoints" INTEGER NOT NULL DEFAULT 10,
    "earnRepeating" BOOLEAN NOT NULL DEFAULT true,
    "pointValue" DECIMAL(14,4) NOT NULL DEFAULT 0.10,
    "minRedeemPoints" INTEGER NOT NULL DEFAULT 100,
    "maxRedeemPct" INTEGER NOT NULL DEFAULT 50,
    "defaultAlertQty" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointEntry" (
    "id" SERIAL NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "PointEntryType" NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "saleReturnId" INTEGER,

    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointEntry_contactId_idx" ON "PointEntry"("contactId");

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
