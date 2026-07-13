-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "tendered" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "currencyWord" TEXT NOT NULL DEFAULT 'TK',
ADD COLUMN     "shopAddress" TEXT,
ADD COLUMN     "shopEmail" TEXT,
ADD COLUMN     "shopName" TEXT NOT NULL DEFAULT 'MPoS',
ADD COLUMN     "shopPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_publicToken_key" ON "Sale"("publicToken");

