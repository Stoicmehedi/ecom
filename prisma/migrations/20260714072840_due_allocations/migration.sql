-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('PAYMENT', 'CREDIT');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "credited" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DueAllocation" (
    "id" SERIAL NOT NULL,
    "kind" "AllocationKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleId" INTEGER NOT NULL,
    "contactId" INTEGER NOT NULL,
    "paymentId" INTEGER,
    "saleReturnId" INTEGER,

    CONSTRAINT "DueAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DueAllocation_saleId_idx" ON "DueAllocation"("saleId");

-- CreateIndex
CREATE INDEX "DueAllocation_contactId_idx" ON "DueAllocation"("contactId");

-- AddForeignKey
ALTER TABLE "DueAllocation" ADD CONSTRAINT "DueAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueAllocation" ADD CONSTRAINT "DueAllocation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueAllocation" ADD CONSTRAINT "DueAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueAllocation" ADD CONSTRAINT "DueAllocation_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
