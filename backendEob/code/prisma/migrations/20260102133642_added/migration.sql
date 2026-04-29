-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "drawOfferCount" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "GuestGames" ADD COLUMN     "drawOfferCount" INTEGER NOT NULL DEFAULT 3;
