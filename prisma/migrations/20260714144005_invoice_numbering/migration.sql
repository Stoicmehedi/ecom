-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
ADD COLUMN     "invoiceStartNo" INTEGER NOT NULL DEFAULT 1;
