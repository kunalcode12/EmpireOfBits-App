/*
  Warnings:

  - You are about to drop the column `upadtedAt` on the `GuestGames` table. All the data in the column will be lost.
  - Added the required column `player1Color` to the `GuestGames` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `GuestGames` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GuestGames" DROP COLUMN "upadtedAt",
ADD COLUMN     "player1Color" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "winner" DROP NOT NULL,
ALTER COLUMN "loser" DROP NOT NULL,
ALTER COLUMN "endedAt" DROP NOT NULL,
ALTER COLUMN "lastMoveBy" DROP NOT NULL;
