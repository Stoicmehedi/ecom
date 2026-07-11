-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountType" "DiscountType" NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HeldSale" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "cart" JSONB NOT NULL,
    "customerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heldById" INTEGER,

    CONSTRAINT "HeldSale_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HeldSale" ADD CONSTRAINT "HeldSale_heldById_fkey" FOREIGN KEY ("heldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

