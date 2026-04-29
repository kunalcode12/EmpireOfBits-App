/*
  Warnings:

  - The values [ADVANCED,EXPERT] on the enum `ChessLevel` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ChessLevel_new" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'PRO');
ALTER TABLE "User" ALTER COLUMN "chessLevel" TYPE "ChessLevel_new" USING ("chessLevel"::text::"ChessLevel_new");
ALTER TYPE "ChessLevel" RENAME TO "ChessLevel_old";
ALTER TYPE "ChessLevel_new" RENAME TO "ChessLevel";
DROP TYPE "ChessLevel_old";
COMMIT;
