/*
  Warnings:

  - The values [COMPUTER] on the enum `GameType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `computerDifficulty` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `playerColor` on the `Game` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "GameType_new" AS ENUM ('ROOM', 'RANDOM');
ALTER TABLE "public"."Game" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Game" ALTER COLUMN "type" TYPE "GameType_new" USING ("type"::text::"GameType_new");
ALTER TYPE "GameType" RENAME TO "GameType_old";
ALTER TYPE "GameType_new" RENAME TO "GameType";
DROP TYPE "public"."GameType_old";
ALTER TABLE "Game" ALTER COLUMN "type" SET DEFAULT 'ROOM';
COMMIT;

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "computerDifficulty",
DROP COLUMN "playerColor";

-- CreateTable
CREATE TABLE "ComputerGame" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "winnerId" INTEGER,
    "loserId" INTEGER,
    "draw" BOOLEAN NOT NULL DEFAULT false,
    "computerDifficulty" "ComputerDifficulty" NOT NULL DEFAULT 'EASY',
    "playerColor" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastMoveBy" TEXT,
    "currentFen" TEXT NOT NULL,
    "moves" JSONB NOT NULL DEFAULT '[]',
    "capturedPieces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputerGame_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ComputerGame" ADD CONSTRAINT "ComputerGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputerGame" ADD CONSTRAINT "ComputerGame_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputerGame" ADD CONSTRAINT "ComputerGame_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
