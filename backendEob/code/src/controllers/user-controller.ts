import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pc from '../clients/prismaClient';
import { authMiddleware } from '../middleware';
const router = express.Router();
import { nanoid } from 'nanoid';
import { redis } from '../clients/redisClient';
import { roomManager } from '../Classes/RoomManager';
import { addGuestGamesToUserProfile } from '../utils/chessUtils';
import { removePlayerFromQueue } from '../Services/MatchMaking';

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
      isGuest: false,
    });
    return;
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
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

export { router };
