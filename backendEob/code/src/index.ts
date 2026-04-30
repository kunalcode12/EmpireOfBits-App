import * as cookie from 'cookie';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Request } from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import { computerGameManager } from './Classes/ComputerGameManager';
import { gameManager } from './Classes/GameManager';
import { roomManager } from './Classes/RoomManager';
import { redis } from './clients/redisClient';
import './config/env';
import { gameRouter } from './controllers/game-controllers';
import { router } from './controllers/user-controller';
import { ErrorMessages } from './utils/messages';

const port = process.env.PORT ?? 3000;
const app = express();

app.use(cookieParser());
app.use(express.json());
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:8082',
  ...(process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      // React Native requests can come without an Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// app.use(
//   cors({
//     origin: true,          // ✅ allow all origins
//     methods: "*",          // ✅ allow all methods
//     allowedHeaders: "*",   // ✅ allow all headers
//     credentials: true
//   })
// );

const userRoutes = router;
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/game', gameRouter);

server.on('upgrade', (req, socket, head) => {
  try {
    const cookieHeader = req.headers['cookie'];

    // console.log("=== WebSocket Upgrade Request ===");
    console.log('Cookie Header:', cookieHeader);

    if (!cookieHeader) {
      // console.log("❌ No cookie header found");
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Extract token from cookies
    const cookies = cookie.parse(cookieHeader);
    const token = cookies.token;
    if (token) {
      if (token) {
        jwt.verify(token, process.env.SECRET_TOKEN!, (err, decoded) => {
          if (err) {
            console.log('❌ Token verification failed');
            socket.destroy();
            return;
          }

          // @ts-ignore
          req.userId = (decoded as any).id;

          wss.handleUpgrade(req, socket, head, (ws) => {
            // @ts-ignore
            ws.userId = (decoded as any).id;
            wss.emit('connection', ws, req);
          });
        });
        return; // Exit after handling the token
      }
    }
    if (cookies.id) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }
    // console.log("Extracted Token:", token ? "Found" : "Not Found");

    if (!token) {
      console.log('❌ No token cookie found');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Verify JWT

    // Attach userId to request
    //@ts-ignore
    req.userId = decodedToken.id;

    // Complete the WebSocket upgrade
    wss.handleUpgrade(req, socket, head, (ws) => {
      //@ts-ignore
      ws.userId = decodedToken.id;
      wss.emit('connection', ws, req); // connection event means that successfull upgrade from the http to WebSocket is done
    });
  } catch (error) {
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', async (socket, req: Request) => {
  const { pathname, query } = parse(req.url, true);

  // userId now ALWAYS COMES FROM JWT COOKIE
  //@ts-ignore
  const userId = socket.userId;

  // console.log(`=== WebSocket Connected ===`);
  // console.log(`Path: ${pathname}`);
  // console.log(`User ID: ${userId}`);

  try {
    // Room
    if (pathname === '/room') {
      if (!userId) {
        socket.send(
          JSON.stringify({
            type: ErrorMessages.NO_AUTH,
            payload: { message: 'User not authenticated!' },
          })
        );
        socket.close();
        return;
      }

      // console.log("Room authenticated user:", userId);
      roomManager.addRoomUser(userId, socket);

      socket.on('close', async () => {
        try {
          await roomManager.handleDisconnection(userId);
        } catch (err) {
          console.error('Room disconnection error:', err);
        }
      });
    }

    // Computer mode
    else if (pathname === '/computer') {
      if (!userId) {
        socket.send(
          JSON.stringify({
            type: ErrorMessages.NO_AUTH,
            payload: { message: 'User not authenticated!' },
          })
        );
        socket.close();
        return;
      }

      // console.log("✅ Computer mode connected for user:", userId);
      computerGameManager.addForComputerGame(userId, socket);
    }

    // Guest mode (special case—no JWT)
    else if (pathname === '/guest') {
      const guestId = typeof query.id === 'string' ? query.id : undefined;

      if (!guestId) {
        socket.send(
          JSON.stringify({
            type: ErrorMessages.NO_AUTH,
            payload: { message: 'Guest ID required!' },
          })
        );
        socket.close();
        return;
      }

      const exists = await redis.exists(`guest:${guestId}`);
      if (!exists) {
        socket.send(
          JSON.stringify({
            type: ErrorMessages.INVALID_AUTH,
            payload: { message: 'Invalid Guest ID!' },
          })
        );
        socket.close();
        return;
      }

      gameManager.addUser(socket, guestId);
      socket.on('close', () => gameManager.handleDisconnection(guestId));
    }
  } catch (error) {
    console.log('Auth error:', error);
    socket.send(
      JSON.stringify({
        type: ErrorMessages.INVALID_AUTH,
        payload: { message: 'Invalid authentication' },
      })
    );
    socket.close();
  }
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});