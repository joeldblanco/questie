import { NextRequest } from "next/server";

import { handleQuestieApiRequest } from "@/lib/server/questie-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    segments: string[];
  };
};

export const GET = (request: NextRequest, context: RouteContext) =>
  handleQuestieApiRequest(request, context.params.segments);

export const POST = (request: NextRequest, context: RouteContext) =>
  handleQuestieApiRequest(request, context.params.segments);

export const PUT = (request: NextRequest, context: RouteContext) =>
  handleQuestieApiRequest(request, context.params.segments);

export const DELETE = (request: NextRequest, context: RouteContext) =>
  handleQuestieApiRequest(request, context.params.segments);
