import { NextRequest, NextResponse } from "next/server";

import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { createLocalUser } from "@/lib/server/auth";
import { mapUser } from "@/lib/server/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        message:
          "DATABASE_URL no está configurada. Define tu conexión de Neon antes de usar el registro local.",
      },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const prisma = getPrisma();
    const user = await createLocalUser(prisma, {
      firstName: body?.firstName ?? "",
      lastName: body?.lastName ?? "",
      birthdate: body?.birthdate ?? new Date(),
      username: body?.username ?? "",
      email: body?.email ?? "",
      password: body?.password ?? "",
    });

    return NextResponse.json(
      {
        message: "Usuario creado correctamente.",
        user: mapUser(user),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo registrar el usuario.",
      },
      { status: 400 },
    );
  }
}
