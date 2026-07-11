-- CreateTable
CREATE TABLE "Exchange" (
    "id" SERIAL NOT NULL,
    "exchangeNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromSaleId" INTEGER NOT NULL,
    "toSaleId" INTEGER NOT NULL,
    "saleReturnId" INTEGER NOT NULL,
    "customerId" INTEGER,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_exchangeNo_key" ON "Exchange"("exchangeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_toSaleId_key" ON "Exchange"("toSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_saleReturnId_key" ON "Exchange"("saleReturnId");

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_fromSaleId_fkey" FOREIGN KEY ("fromSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_toSaleId_fkey" FOREIGN KEY ("toSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
