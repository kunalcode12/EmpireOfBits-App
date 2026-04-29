/*
  Warnings:

  - You are about to drop the column `player1DrawOfferCount` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `player2DrawOfferCount` on the `Game` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Game" DROP COLUMN "player1DrawOfferCount",
DROP COLUMN "player2DrawOfferCount";
