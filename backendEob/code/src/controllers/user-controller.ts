import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bcrypt from 'bcryptjs';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import pc from '../clients/prismaClient';
import { redis } from '../clients/redisClient';
import { authMiddleware } from '../middleware';
import { removePlayerFromQueue } from '../Services/MatchMaking';
import { addGuestGamesToUserProfile } from '../utils/chessUtils';
const router = express.Router();

export enum ChessLevel {
  BEGINNER,
  INTERMEDIATE,
  PRO,
}
export enum RoomStatus {
  WAITING,
  ACTIVE,
  FINISHED,
}

const setAuthCookie = (res: Response, userId: number) => {
  const token = jwt.sign(
    { id: userId },
    process.env.SECRET_TOKEN as string,
    { expiresIn: '8h' }
  );
  res.clearCookie('id');
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 6 * 60 * 60 * 1000,
  });
};

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SELL_POINTS_COST = Number(process.env.SELL_POINTS_COST || '100');
const SELL_SOL_PAYOUT = Number(process.env.SELL_SOL_PAYOUT || '0.001');

const getTreasuryKeypair = (): Keypair => {
  const raw = process.env.TREASURY_PRIVATE_KEY;
  if (!raw) {
    throw new Error('TREASURY_PRIVATE_KEY is not configured');
  }
  let secretKey: Uint8Array;
  try {
    const parsed = JSON.parse(raw) as number[];
    secretKey = Uint8Array.from(parsed);
  } catch {
    throw new Error(
      'Invalid TREASURY_PRIVATE_KEY format. Use JSON array format, e.g. [12,34,...]',
    );
  }
  return Keypair.fromSecretKey(secretKey);
};

const authSuccessResponse = (
  res: Response,
  user: {
    id: number;
    name: string;
    email: string;
    chessLevel: 'BEGINNER' | 'INTERMEDIATE' | 'PRO';
    points: number;
  },
  message: string,
  isNewUser = false
) => {
  res.status(200).json({
    success: true,
    message,
    id: user.id,
    username: user.name,
    email: user.email,
    chessLevel: user.chessLevel,
    points: user.points,
    isGuest: false,
    isNewUser,
  });
};

router.post('/register', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z
        .string()
        .min(3, 'Minimum UserName should be 3 letter long')
        .max(20, 'Max Length of Username is 20')
        .regex(
          /^[a-zA-Z0-9]+$/,
          'Name should only contain letters, numbers, and underscores'
        ),
      email: z.string().email(),
      password: z
        .string()
        .min(6, 'Password Should be 6 char long')
        .max(100, 'Password is too long '),
      chessLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'PRO']),
    });
    const guestId = req.cookies.id;

    const validateData = schema.parse(req.body);
    const { name, email, password, chessLevel } = validateData;
    console.log(name, email, password, chessLevel);

    // Remove player from matchmaking queue if they were searching as guest
    if (guestId) {
      await removePlayerFromQueue(guestId, true);
    }

    const existingUser = await pc.user.findUnique({ where: { email: email } });
    if (existingUser) {
      res.status(400).json({ message: 'User Already Exists', success: false });
      return;
    }
    const hashedPass = await bcrypt.hash(password, 12);

    const newUser = await pc.user.create({
      data: {
        name: name,
        email: email,
        password: hashedPass,
        chessLevel: chessLevel,
      },
    });
    const guestGamesOfUser = await pc.guestGames.findMany({
      where: {
        OR: [{ player1GuestId: guestId }, { player2GuestId: guestId }],
      },
    });
    if (guestGamesOfUser.length > 0) {
      addGuestGamesToUserProfile(guestId, newUser.id);
    }

    const token = jwt.sign(
      { id: newUser.id },
      process.env.SECRET_TOKEN as string,
      { expiresIn: '8h' }
    );

    res.clearCookie('guestId');
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 6 * 60 * 60 * 1000, // 6 hours in ms
    });
    res.status(200).json({
      message: 'User Created',
      success: true,
      id: newUser.id,
      username: newUser.name,
      email: newUser.email,
      chessLevel: chessLevel,
      points: newUser.points,
      isGuest: false,
    });
    return;
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: 'Validation error',
        errors: error.errors,
        success: false,
      });
    } else {
      console.error('Register error:', error);
      res.status(500).json({
        message: 'Internal server error',
        success: false,
      });
    }
  }
});
//Will return games also which are computer and room-based!
router.get('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    //@ts-ignore
    const id = req.userId;
    //Checking if the redis has the profile cached
    const userProfileInRedis = await redis.get(`user:${id}:profile`);
    if (userProfileInRedis) {
      // const userProfile = await redis.get(`user:{id}:profile`);
      console.log(JSON.parse(userProfileInRedis));
      res.status(200).json({
        success: true,
        userProfile: JSON.parse(userProfileInRedis),
        isGuest: false,
      });
      return;
    }

    const user = await pc.user.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        name: true,
        email: true,
        chessLevel: true,
        points: true,
        rating: true,
        computerGames: {
          orderBy: { createdAt: 'desc' },
        },
        createdRooms: {
          where: {
            game: {
              isNot: null,
            },
          },

          include: {
            game: {
              include: {
                winner: {
                  select: {
                    id: true,
                    name: true,
                    chessLevel: true,
                  },
                },
                loser: {
                  select: {
                    id: true,
                    name: true,
                    chessLevel: true,
                  },
                },
              },
            },

            joinedBy: {
              select: {
                id: true,
                name: true,
                chessLevel: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        joinedRooms: {
          where: {
            game: {
              isNot: null,
            },
          },
          include: {
            game: {
              include: {
                winner: {
                  select: {
                    id: true,
                    name: true,
                    chessLevel: true,
                  },
                },
                loser: {
                  select: {
                    id: true,
                    name: true,
                    chessLevel: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
                chessLevel: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        computerGamesWon: {
          orderBy: { createdAt: 'desc' },
        },
        computerGamesLost: {
          orderBy: { createdAt: 'desc' },
        },
        guestGamesAsP1: {
          orderBy: { createdAt: 'desc' },
        },
        guestGamesAsP2: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    // const room=user.created
    // Calculate room games from createdRooms and joinedRooms
    const allRoomGames = [
      ...user.createdRooms.map((r) => ({
        ...r.game,
        roomId: r.id,
        roomCode: r.code,
        isCreator: true,
        opponentId: r.joinedBy?.id,
        opponentName: r.joinedBy?.name,
        opponentChessLevel: r.joinedBy?.chessLevel,
      })),
      ...user.joinedRooms.map((r) => ({
        ...r.game,
        roomId: r.id,
        roomCode: r.code,
        isCreator: false,
        opponentId: r.createdBy?.id,
        opponentName: r.createdBy?.name,
        opponentChessLevel: r.createdBy?.chessLevel,
      })),
    ].filter((g) => g && g.status === 'FINISHED');

    const roomGamesWon = allRoomGames.filter(
      (g) => !g.draw && g.winnerId === user.id
    );
    const roomGamesLost = allRoomGames.filter(
      (g) => !g.draw && g.loserId === user.id
    );
    const roomGamesDrawn = allRoomGames.filter((g) => g.draw);
    // Calculate guest games stats
    const allGuestGames = [...user.guestGamesAsP1, ...user.guestGamesAsP2];
    const guestGamesWon = allGuestGames.filter((g) => {
      const isP1 = g.player1UserId === user.id;
      const playerColor = isP1
        ? g.player1Color
        : g.player1Color === 'w'
          ? 'b'
          : 'w';
      return g.winner === playerColor && g.status === 'FINISHED';
    });
    const guestGamesLost = allGuestGames.filter((g) => {
      const isP1 = g.player1UserId === user.id;
      const playerColor = isP1
        ? g.player1Color
        : g.player1Color === 'w'
          ? 'b'
          : 'w';
      return g.loser === playerColor && g.status === 'FINISHED';
    });
    const guestGamesDrawn = allGuestGames.filter(
      (g) => g.draw && g.status === 'FINISHED'
    );
    // Calculate stats
    const stats = {
      computer: {
        total: user.computerGames.length,
        won: user.computerGamesWon.length,
        lost: user.computerGamesLost.length,
        drawn: user.computerGames.filter((g) => g.draw).length,
      },
      room: {
        total: allRoomGames.length,
        won: roomGamesWon.length,
        lost: roomGamesLost.length,
        drawn: roomGamesDrawn.length,
      },
      guest: {
        total: allGuestGames.filter((g) => g.status === 'FINISHED').length,
        won: guestGamesWon.length,
        lost: guestGamesLost.length,
        drawn: guestGamesDrawn.length,
      },
    };

    // Calculate room game time
    const roomGameTime = allRoomGames.reduce((total, games) => {
      const started = new Date(games.createdAt!).getTime();
      const ended = games.endedAt
        ? new Date(games.endedAt).getTime()
        : new Date(games.updatedAt!).getTime();

      const totalLength = ended - started;
      return total + totalLength;
    }, 0);
    const computerGameTime = user.computerGames.reduce((total, games) => {
      const started = new Date(games.createdAt).getTime();
      const ended = new Date(games.updatedAt).getTime();
      const totalLength = ended - started;
      return total + totalLength;
    }, 0);
    const guestGameTime = allGuestGames.reduce((total, games) => {
      const started = new Date(games.createdAt).getTime();
      const ended = games.endedAt
        ? new Date(games.endedAt).getTime()
        : new Date(games.updatedAt).getTime();
      const totalLength = ended - started;
      return total + totalLength;
    }, 0);
    const totalTimePlayedMs = roomGameTime + computerGameTime + guestGameTime;
    // console.log(totalTimePlayedMs);
    const totalHours = Math.floor(totalTimePlayedMs / (1000 * 60 * 60));
    const totalMinutes = Math.floor((totalTimePlayedMs % 3600000) / 60000);
    const totalTimePlayed = `${totalHours}h ${totalMinutes}m`;
    // console.log(totalTimePlayed);

    const userProfile = {
      user: {
        id: user.id,
        name: user.name,
        chessLevel: user.chessLevel,
        email: user.email,
        points: user.points,
        rating: user.rating,
      },
      stats,
      totalTimePlayed: totalTimePlayed,
      recentGames: {
        computerGamesWon: user.computerGamesWon,
        computerGamesLost: user.computerGamesLost,
        computerGamesInProgress: user.computerGames.filter(
          (games) => games.status === 'ACTIVE'
        ),
        roomGamesWon,
        roomGamesLost,
        roomGamesDrawn,
        guestGamesWon,
        guestGamesLost,
        guestGamesDrawn,
      },
      // Send all games to user
      allGames: {
        roomGames: allRoomGames,
        computerGames: user.computerGames,
        guestGames: allGuestGames,
      },
      // Include rooms with opponent info
      rooms: {
        created: user.createdRooms,
        joined: user.joinedRooms,
      },
    };
    await redis.setEx(`user:${id}:profile`, 30, JSON.stringify(userProfile)); // Reduced to 30 seconds for faster updates
    res.status(200).json({
      success: true,
      userProfile,
      isGuest: false,
    });
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email('Invalid Email'),
      password: z.string().min(3, 'Password is required'),
    });
    const { email, password } = schema.parse(req.body);

    // Remove player from matchmaking queue if they were searching as guest
    const guestId = req.cookies.id;
    if (guestId) {
      await removePlayerFromQueue(guestId, true);
    }
    const user = await pc.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ message: 'User Does not exist', success: false });
      return;
    }

    if (!user.password) {
      res.status(400).json({
        message: 'This account uses social login.  Please sign in with Google.',
        success: false,
      });
      return;
    }
    const checkedPass = await bcrypt.compare(password, user.password);

    if (!checkedPass) {
      res
        .status(401)
        .json({ message: 'Invalid email or password', success: false });
      return;
    }
    const token = jwt.sign(
      { id: user.id },
      process.env.SECRET_TOKEN as string,
      { expiresIn: '8h' }
    );
    res.clearCookie('id');
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 6 * 60 * 60 * 1000, // 6 hours in ms
    });
    res.status(200).json({
      success: true,
      message: 'Login Successful',
      id: user.id,
      username: user.name,
      email: user.email,
      chessLevel: user.chessLevel,
      points: user.points,
      isGuest: false,
    });
    return;
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
  }
});

router.post('/register-or-login', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email('Invalid Email'),
      name: z
        .string()
        .min(3, 'Minimum UserName should be 3 letter long')
        .max(20, 'Max Length of Username is 20')
        .regex(
          /^[a-zA-Z0-9]+$/,
          'Name should only contain letters, numbers, and underscores'
        ),
      password: z
        .string()
        .min(6, 'Password Should be 6 char long')
        .max(100, 'Password is too long '),
    });
    const { email, name, password } = schema.parse(req.body);
    const guestId = req.cookies.id;

    if (guestId) {
      await removePlayerFromQueue(guestId, true);
    }

    const existingUser = await pc.user.findUnique({ where: { email } });

    if (existingUser) {
      if (!existingUser.password) {
        res.status(400).json({
          message:
            'This account uses social login. Please sign in with social auth.',
          success: false,
        });
        return;
      }

      const checkedPass = await bcrypt.compare(password, existingUser.password);
      if (!checkedPass) {
        res
          .status(401)
          .json({ message: 'Invalid email or password', success: false });
        return;
      }

      setAuthCookie(res, existingUser.id);
      authSuccessResponse(res, existingUser, 'Login Successful');
      return;
    }

    const hashedPass = await bcrypt.hash(password, 12);
    const newUser = await pc.user.create({
      data: {
        name,
        email,
        password: hashedPass,
        chessLevel: 'BEGINNER',
      },
    });

    const guestGamesOfUser = await pc.guestGames.findMany({
      where: {
        OR: [{ player1GuestId: guestId }, { player2GuestId: guestId }],
      },
    });
    if (guestGamesOfUser.length > 0 && guestId) {
      addGuestGamesToUserProfile(guestId, newUser.id);
    }

    setAuthCookie(res, newUser.id);
    authSuccessResponse(res, newUser, 'User Created', true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: 'Validation error',
        errors: error.errors,
        success: false,
      });
      return;
    }
    console.error('Register or login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post(
  '/profile/update',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { email, password, chessLevel, name } = req.body;

      const updateData: any = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (chessLevel) updateData.chessLevel = chessLevel;
      if (password) updateData.password = await bcrypt.hash(password, 12);
      //@ts-ignore
      const userId = req.userId;
      const updatedUser = await pc.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          chessLevel: true,
        },
      });
      await redis.del(`user:${userId}:profile`);
      res.status(200).json({
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (error) {
      res.status(500).json({ error: error });
      console.log(error);
    }
  }
);

router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.clearCookie('token');
    res.status(200).json({ success: true, message: 'Logout sucessfull' });
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
  }
});

router.get('/points', authMiddleware, async (req: Request, res: Response) => {
  try {
    //@ts-ignore
    const id = req.userId;
    const user = await pc.user.findUnique({
      where: { id: Number(id) },
      select: { id: true, email: true, points: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({
      success: true,
      id: user.id,
      email: user.email,
      points: user.points,
    });
  } catch (error) {
    console.error('Get points error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/points', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      delta: z.number().int(),
    });
    const { delta } = schema.parse(req.body);
    //@ts-ignore
    const id = req.userId;

    const updated = await pc.user.update({
      where: { id: Number(id) },
      data: { points: { increment: delta } },
      select: { id: true, email: true, points: true },
    });

    await redis.del(`user:${id}:profile`);

    res.status(200).json({
      success: true,
      id: updated.id,
      email: updated.email,
      points: updated.points,
      delta,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: 'Validation error',
        errors: error.errors,
        success: false,
      });
      return;
    }
    console.error('Update points error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/points/sell', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      walletAddress: z.string().min(32),
    });
    const { walletAddress } = schema.parse(req.body);
    //@ts-ignore
    const id = req.userId;

    let recipient: PublicKey;
    try {
      recipient = new PublicKey(walletAddress);
    } catch {
      res.status(400).json({ success: false, message: 'Invalid wallet address' });
      return;
    }

    const updated = await pc.user.updateMany({
      where: {
        id: Number(id),
        points: { gte: SELL_POINTS_COST },
      },
      data: {
        points: { decrement: SELL_POINTS_COST },
      },
    });

    if (updated.count === 0) {
      res.status(400).json({
        success: false,
        message: `Not enough points. Need at least ${SELL_POINTS_COST}`,
      });
      return;
    }

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const treasury = getTreasuryKeypair();
    const expectedTreasuryPublic = process.env.TREASURY_PUBLIC_KEY;
    if (expectedTreasuryPublic && treasury.publicKey.toBase58() !== expectedTreasuryPublic) {
      throw new Error('TREASURY_PUBLIC_KEY does not match TREASURY_PRIVATE_KEY');
    }

    const lamports = Math.round(SELL_SOL_PAYOUT * LAMPORTS_PER_SOL);
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: treasury.publicKey,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: recipient,
        lamports,
      }),
    );

    let signature = '';
    try {
      signature = await sendAndConfirmTransaction(connection, tx, [treasury], {
        commitment: 'confirmed',
      });
    } catch (payoutError) {
      await pc.user.update({
        where: { id: Number(id) },
        data: { points: { increment: SELL_POINTS_COST } },
      });
      await redis.del(`user:${id}:profile`);
      throw payoutError;
    }

    const user = await pc.user.findUnique({
      where: { id: Number(id) },
      select: { id: true, email: true, points: true },
    });
    await redis.del(`user:${id}:profile`);

    res.status(200).json({
      success: true,
      id: user?.id,
      email: user?.email,
      points: user?.points,
      pointsSpent: SELL_POINTS_COST,
      payoutSol: SELL_SOL_PAYOUT,
      txSignature: signature,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: 'Validation error',
        errors: error.errors,
        success: false,
      });
      return;
    }
    console.error('Sell points error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

//This api is used for guest cookie generation which can be used to restore games.
router.get('/cookie', async (req: Request, res: Response) => {
  try {
    const existingId = req.cookies.id;

    console.log(existingId);
    if (existingId) {
      const isValidId = await redis.exists(`guest:${existingId}`);
      if (isValidId) {
        await redis.expire(`guest:${existingId}`, 30 * 60);
        res.cookie('id', existingId, {
          httpOnly: true,
          secure: true,
          maxAge: 30 * 60 * 1000, // 30 min
          path: '/',
        });
        res.status(200).json({ id: existingId, success: true, isGuest: true });
        return;
      }
    }

    const guestCookie = uuidv4();

    await redis.set(
      `guest:${guestCookie}`,
      JSON.stringify({
        createdAt: Date.now(),
        ip: req.ip,
        requestFrom: req.headers['user-agent'] || 'unknown',
      }),
      { EX: 30 * 60 }
    );

    res.cookie('id', guestCookie, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 60 * 1000,
      path: '/',
    });
    res.status(200).json({ id: guestCookie, success: true, isGuest: true });
    return;
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
  }
});

router.post(
  '/checkAuth',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      //@ts-ignore
      const id = req.userId;

      const user = await pc.user.findUnique({ where: { id: Number(id) } });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error });
      console.log(error);
    }
  }
);
// Room endpoints removed.

// router.patch()

// GET /api/v1/user/:id/rating — public rating lookup for any user.
router.get('/:id/rating', async (req: Request, res: Response) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      res.status(400).json({ success: false, message: 'Invalid user id' });
      return;
    }

    const user = await pc.user.findUnique({
      where: { id: idNum },
      select: { id: true, name: true, rating: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      userId: user.id,
      username: user.name,
      rating: user.rating,
    });
  } catch (error) {
    console.error('Get user rating error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export { router };

