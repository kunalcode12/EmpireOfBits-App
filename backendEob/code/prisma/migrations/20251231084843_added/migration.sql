-- CreateTable
CREATE TABLE "GuestGames" (
    "id" SERIAL NOT NULL,
    "player1GuestId" TEXT NOT NULL,
    "player2GuestId" TEXT NOT NULL,
    "player1UserId" INTEGER,
    "player2UserId" INTEGER,
    "status" "GameStatus" NOT NULL DEFAULT 'ACTIVE',
    "draw" BOOLEAN NOT NULL DEFAULT false,
    "winner" TEXT NOT NULL,
    "loser" TEXT NOT NULL,
    "player1TimeLeft" INTEGER NOT NULL DEFAULT 600,
    "player2TimeLeft" INTEGER NOT NULL DEFAULT 600,
    "moves" JSONB NOT NULL DEFAULT '[]',
    "capturedPieces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upadtedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "lastMoveBy" TEXT NOT NULL,
    "currentFen" TEXT NOT NULL,

    CONSTRAINT "GuestGames_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GuestGames" ADD CONSTRAINT "GuestGames_player1UserId_fkey" FOREIGN KEY ("player1UserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestGames" ADD CONSTRAINT "GuestGames_player2UserId_fkey" FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
