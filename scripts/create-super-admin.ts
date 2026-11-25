import "dotenv/config";
import readline from "readline";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/security";
import { ROLES } from "../src/lib/constants";
import { generateAuditEventId } from "../src/lib/audit";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const username =
    process.env.SUPER_ADMIN_USERNAME ||
    (await prompt("Super Admin username: "));
  const fullName =
    process.env.SUPER_ADMIN_NAME ||
    (await prompt("Super Admin full name: "));
  const email =
    process.env.SUPER_ADMIN_EMAIL ||
    (await prompt("Super Admin email (optional): "));
  const password =
    process.env.SUPER_ADMIN_PASSWORD ||
    (await prompt("Super Admin password (min 8 chars): "));

  if (!username || username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }
  if (!fullName || fullName.length < 2) {
    throw new Error("Full name is required.");
  }
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new Error(`User "${username}" already exists.`);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      email: email || null,
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      eventId: generateAuditEventId(),
      actorUserId: user.id,
      actorUsername: user.username,
      actorRole: user.role,
      actionType: "SUPER_ADMIN_CREATED",
      details: `Platform Super Admin "${user.username}" initialized via CLI.`,
    },
  });

  console.log(`Super Admin "${user.username}" created successfully.`);
}

main()
  .catch((err) => {
    console.error("Failed to create Super Admin:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
