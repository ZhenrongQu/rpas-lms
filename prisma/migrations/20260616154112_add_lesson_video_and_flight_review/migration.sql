-- AlterTable
ALTER TABLE "AdvancedLesson" ADD COLUMN     "videoDurationSec" INTEGER,
ADD COLUMN     "videoStatus" TEXT,
ADD COLUMN     "videoThumbnailUrl" TEXT,
ADD COLUMN     "videoUid" TEXT;

-- AlterTable
ALTER TABLE "BasicLesson" ADD COLUMN     "videoDurationSec" INTEGER,
ADD COLUMN     "videoStatus" TEXT,
ADD COLUMN     "videoThumbnailUrl" TEXT,
ADD COLUMN     "videoUid" TEXT;

-- CreateTable
CREATE TABLE "FlightReviewSlot" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT NOT NULL,
    "examinerName" TEXT NOT NULL,
    "examinerEmail" TEXT,
    "examinerPhone" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlightReviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightReviewBooking" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlightReviewBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlightReviewSlot_startsAt_idx" ON "FlightReviewSlot"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlightReviewBooking_slotId_key" ON "FlightReviewBooking"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "FlightReviewBooking_customerId_key" ON "FlightReviewBooking"("customerId");

-- AddForeignKey
ALTER TABLE "FlightReviewBooking" ADD CONSTRAINT "FlightReviewBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "FlightReviewSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightReviewBooking" ADD CONSTRAINT "FlightReviewBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
