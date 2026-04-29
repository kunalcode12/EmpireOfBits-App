/*
  Warnings:

  - You are about to drop the column `draw` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `timers` on the `Game` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Game" DROP COLUMN "draw",
DROP COLUMN "timers",
ADD COLUMN     "blackTimeLeft" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "lastMoveAt" TIMESTAMP(3),
ADD COLUMN     "lastMoveBy" TEXT,
ADD COLUMN     "whiteTimeLeft" INTEGER NOT NULL DEFAULT 600;
