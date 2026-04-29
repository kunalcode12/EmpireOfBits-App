-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "capturedPieces" TEXT[] DEFAULT ARRAY[]::TEXT[];
