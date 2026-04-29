import bcrypt from 'bcryptjs';
import pc from './clients/prismaClient';


async function main() {
  console.log('Seeding database...');

  // --- 1. Create Users ---
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await pc.user.create({
    data: {
      name: 'Alice',
      email: 'alice@example.com',
      password: passwordHash,
      chessLevel: 'BEGINNER',
    },
  });

  const bob = await pc.user.create({
    data: {
      name: 'Bob',
      email: 'bob@example.com',
      password: passwordHash,
      chessLevel: 'INTERMEDIATE',
    },
  });

  const charlie = await pc.user.create({
    data: {
      name: 'Charlie',
      email: 'charlie@example.com',
      // Google user without password
      googleId: 'google-uid-123',
      chessLevel: 'PRO',
    },
  });

  console.log('Seeding finished!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pc.$disconnect();
  });
