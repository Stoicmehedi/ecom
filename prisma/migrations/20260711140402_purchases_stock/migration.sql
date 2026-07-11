-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('AMOUNT', 'PERCENT');

-- DropIndex
DROP INDEX "Purchase_invoiceNo_key";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "purchaseReturnId" INTEGER;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "lastPurchasePrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Purchase" DROP COLUMN "invoiceNo",
ADD COLUMN     "discountType" "DiscountType" NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseNo" TEXT NOT NULL,
ADD COLUMN     "supplierInvoiceNo" TEXT;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "returnedQty" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReturnType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReturnType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" SERIAL NOT NULL,
    "returnNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunded" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" INTEGER NOT NULL,
    "supplierId" INTEGER,
    "returnTypeId" INTEGER NOT NULL,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturnItem" (
    "id" SERIAL NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "returnId" INTEGER NOT NULL,
    "purchaseItemId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL,

    CONSTRAINT "PurchaseReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnType_name_key" ON "ReturnType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_returnNo_key" ON "PurchaseReturn"("returnNo");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseNo_key" ON "Purchase"("purchaseNo");

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_returnTypeId_fkey" FOREIGN KEY ("returnTypeId") REFERENCES "ReturnType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

