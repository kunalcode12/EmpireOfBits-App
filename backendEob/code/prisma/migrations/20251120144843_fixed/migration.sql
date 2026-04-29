/*
  Warnings:

  - The `roomId` column on the `Game` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `gameId` on the `Room` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ComputerDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- DropForeignKey
ALTER TABLE "public"."Room" DROP CONSTRAINT "Room_gameId_fkey";

-- DropIndex
DROP INDEX "public"."Room_gameId_key";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "computerDifficulty" "ComputerDifficulty" DEFAULT 'EASY',
ADD COLUMN     "playerColor" TEXT,
DROP COLUMN "roomId",
ADD COLUMN     "roomId" INTEGER;

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "gameId";

-- CreateIndex
CREATE UNIQUE INDEX "Game_roomId_key" ON "Game"("roomId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
