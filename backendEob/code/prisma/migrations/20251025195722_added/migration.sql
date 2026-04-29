/*
  Warnings:

  - A unique constraint covering the columns `[roomId]` on the table `Game` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `currentFen` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endedAt` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roomId` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('ROOM', 'RANDOM');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "chat" JSONB[],
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currentFen" TEXT NOT NULL,
ADD COLUMN     "endedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "roomId" TEXT NOT NULL,
ADD COLUMN     "timers" JSONB,
ADD COLUMN     "type" "GameType" NOT NULL DEFAULT 'ROOM',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "moves" SET DEFAULT '[]';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Game_roomId_key" ON "Game"("roomId");
