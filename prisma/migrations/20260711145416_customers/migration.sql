-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "customerGroupId" INTEGER,
ADD COLUMN     "isWalkIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomerGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroup_name_key" ON "CustomerGroup"("name");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

