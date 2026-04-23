import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "@prisma/client";

import { mapUser } from "@/lib/server/mappers";
import { slugify } from "@/lib/server/slug";

const JWT_SECRET = process.env.JWT_SECRET || "questie-dev-jwt-secret";
const JWT_EXPIRES_IN = "2h";

type CreateUserInput = {
  firstName: string;
  lastName: string;
  birthdate: Date | string;
  username: string;
  email: string;
  password: string;
  profilePic?: string;
  role?: string;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizeBirthdate = (birthdate: Date | string) => {
  const parsedDate =
    birthdate instanceof Date ? birthdate : new Date(birthdate);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
};

const buildTokenPayload = (user: any) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  role: user.role,
  isAdmin: user.role,
  sub: user.id,
});

const buildUsernameBase = (username: string, email: string) => {
  const sanitizedUsername = slugify(username || email.split("@")[0]).replace(
    /-/g,
    "",
  );
  return sanitizedUsername.length > 0 ? sanitizedUsername : "questieuser";
};

export const hashPassword = async (password: string) =>
  bcrypt.hash(password, 10);

export const comparePassword = async (
  password: string,
  hashedPassword: string,
) => bcrypt.compare(password, hashedPassword);

export const createAuthToken = (user: any) =>
  jwt.sign(buildTokenPayload(user), JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export const createAuthResponse = (user: any) => ({
  message: "Login successful",
  token: createAuthToken(user),
  payload: buildTokenPayload(user),
  user: mapUser(user),
});

export const ensureUniqueUsername = async (
  prisma: PrismaClient,
  username: string,
  email: string,
) => {
  const baseUsername = buildUsernameBase(username, email);
  let candidate = baseUsername;
  let suffix = 2;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    candidate = `${baseUsername}${suffix}`;
    suffix += 1;
  }

  return candidate;
};

export const createLocalUser = async (
  prisma: PrismaClient,
  input: CreateUserInput,
) => {
  const email = normalizeEmail(input.email);

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    throw new Error("Ya existe un usuario con ese email.");
  }

  const username = await ensureUniqueUsername(prisma, input.username, email);
  const password = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      password,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      birthdate: normalizeBirthdate(input.birthdate),
      profilePic:
        input.profilePic || "https://placehold.co/200x200?text=Questie",
      role: input.role || "user",
      stats: {
        create: {
          coins: 0,
          xp: 0,
        },
      },
    },
    include: {
      stats: true,
    },
  });

  return user;
};

export const loginLocalUser = async (
  prisma: PrismaClient,
  input: { username: string; password: string },
) => {
  const usernameOrEmail = input.username.trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: usernameOrEmail },
        { email: normalizeEmail(usernameOrEmail) },
      ],
    },
    include: {
      stats: true,
    },
  });

  if (!user) {
    throw new Error("Credenciales inválidas.");
  }

  const passwordMatches = await comparePassword(input.password, user.password);

  if (!passwordMatches) {
    throw new Error("Credenciales inválidas.");
  }

  return user;
};

export const syncAuth0User = async (
  prisma: PrismaClient,
  input: Partial<CreateUserInput> & { email: string },
) => {
  const email = normalizeEmail(input.email);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { stats: true },
  });

  if (existingUser) {
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        firstName: input.firstName?.trim() || existingUser.firstName,
        lastName: input.lastName?.trim() || existingUser.lastName,
        profilePic: input.profilePic || existingUser.profilePic,
      },
      include: { stats: true },
    });

    return updatedUser;
  }

  return createLocalUser(prisma, {
    firstName: input.firstName?.trim() || "Questie",
    lastName: input.lastName?.trim() || "User",
    birthdate: input.birthdate || new Date(),
    username: input.username || email.split("@")[0],
    email,
    password: input.password || randomUUID(),
    profilePic: input.profilePic,
    role: input.role,
  });
};
