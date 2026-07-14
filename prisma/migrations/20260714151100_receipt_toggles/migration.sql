-- CreateEnum
CREATE TYPE "PrintDoc" AS ENUM ('RECEIPT', 'A4');

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "defaultPrint" "PrintDoc" NOT NULL DEFAULT 'RECEIPT',
ADD COLUMN     "footerNote" TEXT,
ADD COLUMN     "showInWords" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPaymentDetails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSignatures" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSizeColour" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSku" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showTime" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signatureLeft" TEXT NOT NULL DEFAULT 'Received by',
ADD COLUMN     "signatureRight" TEXT NOT NULL DEFAULT 'Authorised by';
