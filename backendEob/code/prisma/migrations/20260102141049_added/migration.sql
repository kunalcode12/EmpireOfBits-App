/*
  Warnings:

  - You are about to drop the column `drawOfferCount` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `drawOfferCount` on the `GuestGames` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Game" DROP COLUMN "drawOfferCount",
ADD COLUMN     "player1DrawOfferCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "player2DrawOfferCount" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "GuestGames" DROP COLUMN "drawOfferCount",
ADD COLUMN     "player1DrawOfferCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "player2DrawOfferCount" INTEGER NOT NULL DEFAULT 3;
