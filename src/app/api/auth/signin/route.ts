import { NextRequest, NextResponse } from "next/server";

import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { createAuthResponse, loginLocalUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        message:
          "DATABASE_URL no está configurada. Define tu conexión de Neon antes de usar el login local.",
      },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const prisma = getPrisma();
    const user = await loginLocalUser(prisma, {
      username: body?.username ?? "",
      password: body?.password ?? "",
    });

    return NextResponse.json(createAuthResponse(user));
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "No se pudo iniciar sesión.",
      },
      { status: 401 },
    );
  }
}
