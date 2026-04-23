import type { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { syncAuth0User } from "@/lib/server/auth";
import {
  mapCategory,
  mapCourse,
  mapEnrolment,
  mapInvoice,
  mapLesson,
  mapModule,
  mapProduct,
  mapProgress,
  mapSearchResult,
  mapUser,
} from "@/lib/server/mappers";
import { generateUniqueSlug } from "@/lib/server/slug";
import { fileToDataUrl } from "@/lib/server/uploads";

const courseInclude = {
  categories: {
    include: {
      category: true,
    },
  },
  modules: {
    include: {
      lessons: {
        include: {
          contents: true,
        },
        orderBy: {
          order: "asc" as const,
        },
      },
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
};

const moduleInclude = {
  lessons: {
    include: {
      contents: true,
    },
    orderBy: {
      order: "asc" as const,
    },
  },
  course: {
    select: {
      id: true,
      slug: true,
    },
  },
};

const lessonInclude = {
  contents: true,
  module: {
    include: {
      course: {
        select: {
          id: true,
        },
      },
    },
  },
};

const userInclude = {
  stats: true,
};

const invoiceInclude = {
  product: true,
};

const json = (payload: unknown, init?: ResponseInit) =>
  NextResponse.json(payload, init);

const errorResponse = (
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
) => json({ message, ...extra }, { status });

const parseJsonBody = async (request: NextRequest) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const isMultipartRequest = (request: NextRequest) =>
  request.headers.get("content-type")?.includes("multipart/form-data") ?? false;

const asString = (
  value: FormDataEntryValue | string | number | boolean | null | undefined,
) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asFile = (value: FormDataEntryValue | null) =>
  value instanceof File ? value : null;

const normalizeContentInput = (
  type: string,
  payload: Record<string, unknown>,
) => {
  const normalized = { ...payload };

  if (type === "image") {
    const image = normalized.image ?? normalized.image_url ?? "";
    normalized.image = image;
    normalized.image_url = image;
  }

  if (type === "video") {
    const video = normalized.video ?? normalized.video_url ?? "";
    normalized.video = video;
    normalized.video_url = video;
  }

  return normalized;
};

const findCourseByIdOrSlug = (prisma: PrismaClient, identifier: string) =>
  prisma.course.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    include: courseInclude,
  });

const findModuleByIdOrSlug = (prisma: PrismaClient, identifier: string) =>
  prisma.module.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    include: moduleInclude,
  });

const findLessonByIdOrSlug = (prisma: PrismaClient, identifier: string) =>
  prisma.lesson.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    include: lessonInclude,
  });

const findUserById = (prisma: PrismaClient, identifier: string) =>
  prisma.user.findFirst({
    where: {
      OR: [{ id: identifier }, { username: identifier }, { email: identifier }],
    },
    include: userInclude,
  });

const ensureCourseSlug = (
  prisma: PrismaClient,
  title: string,
  excludeId?: string,
) =>
  generateUniqueSlug(title, async (slug) => {
    const match = await prisma.course.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    return Boolean(match);
  });

const ensureCategorySlug = (
  prisma: PrismaClient,
  name: string,
  excludeId?: string,
) =>
  generateUniqueSlug(name, async (slug) => {
    const match = await prisma.category.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    return Boolean(match);
  });

const ensureModuleSlug = (
  prisma: PrismaClient,
  title: string,
  excludeId?: string,
) =>
  generateUniqueSlug(title, async (slug) => {
    const match = await prisma.module.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    return Boolean(match);
  });

const ensureLessonSlug = (
  prisma: PrismaClient,
  title: string,
  excludeId?: string,
) =>
  generateUniqueSlug(title, async (slug) => {
    const match = await prisma.lesson.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    return Boolean(match);
  });

const setCourseCategories = async (
  prisma: PrismaClient,
  courseId: string,
  categoryIds: string[],
) => {
  const uniqueCategoryIds = Array.from(new Set(categoryIds.filter(Boolean)));

  await prisma.courseCategory.deleteMany({ where: { courseId } });

  if (uniqueCategoryIds.length > 0) {
    await prisma.courseCategory.createMany({
      data: uniqueCategoryIds.map((categoryId) => ({ courseId, categoryId })),
      skipDuplicates: true,
    });
  }
};

const recalculateCourseAssessment = async (
  prisma: PrismaClient,
  courseId: string,
) => {
  const aggregate = await prisma.assessment.aggregate({
    where: { courseId },
    _avg: { score: true },
  });

  await prisma.course.update({
    where: { id: courseId },
    data: {
      assessment: aggregate._avg.score ?? 0,
    },
  });
};

const getCourseProgressSummary = async (
  prisma: PrismaClient,
  courseId: string,
  userId: string,
) => {
  const lessons = await prisma.lesson.findMany({
    where: {
      module: {
        courseId,
      },
    },
    select: {
      id: true,
    },
  });

  const lessonIds = lessons.map((lesson) => lesson.id);
  const completedLessons = lessonIds.length
    ? await prisma.progress.count({
        where: {
          userId,
          lessonId: {
            in: lessonIds,
          },
        },
      })
    : 0;

  return {
    totalLessons: lessonIds.length,
    completedLessons,
    remainingLessons: Math.max(lessonIds.length - completedLessons, 0),
  };
};

const handleUsersRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
) => {
  if (method !== "GET") {
    return errorResponse("Método no permitido.", 405);
  }

  if (rest.length === 0) {
    const users = await prisma.user.findMany({
      include: userInclude,
      orderBy: { createdAt: "desc" },
    });

    return json(users.map((user) => mapUser(user)));
  }

  const user = await findUserById(prisma, rest[0]);

  if (!user) {
    return errorResponse("Usuario no encontrado.", 404);
  }

  return json(mapUser(user));
};

const handleStatsRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method !== "POST" || rest[0] !== "coins" || !rest[1]) {
    return errorResponse("Ruta de stats no soportada.", 404);
  }

  const user = await findUserById(prisma, rest[1]);

  if (!user) {
    return errorResponse("Usuario no encontrado.", 404);
  }

  const body = await parseJsonBody(request);
  const coins = asNumber(body?.coins, 0);

  await prisma.stats.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      coins,
      xp: 0,
    },
    update: {
      coins: {
        increment: coins,
      },
    },
  });

  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: userInclude,
  });

  return json(mapUser(updatedUser));
};

const handleCoursesRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "GET" && rest.length === 0) {
    const courses = await prisma.course.findMany({
      include: courseInclude,
      orderBy: { createdAt: "desc" },
    });

    return json(courses.map((course) => mapCourse(course)));
  }

  if (method === "POST" && rest.length === 0) {
    if (isMultipartRequest(request)) {
      const formData = await request.formData();
      const title = asString(formData.get("title"));
      const headline = asString(formData.get("headline"));
      const description = asString(formData.get("description"));

      if (!title || !headline || !description) {
        return errorResponse("Faltan datos obligatorios del curso.");
      }

      const slug = await ensureCourseSlug(prisma, title);
      const image =
        (await fileToDataUrl(asFile(formData.get("courseImg")))) ||
        "https://placehold.co/1200x675?text=Questie";
      const bgImage =
        (await fileToDataUrl(asFile(formData.get("courseBgImg")))) ||
        "https://placehold.co/1600x900?text=Questie";

      const course = await prisma.course.create({
        data: {
          title,
          slug,
          headline,
          description,
          image,
          bgImage,
          status: "pending",
        },
        include: courseInclude,
      });

      return json(mapCourse(course), { status: 201 });
    }

    const body = await parseJsonBody(request);
    const title = asString(body?.title);
    const headline = asString(body?.headline);
    const description = asString(body?.description);

    if (!title || !headline || !description) {
      return errorResponse("Faltan datos obligatorios del curso.");
    }

    const slug = await ensureCourseSlug(prisma, title);

    const course = await prisma.course.create({
      data: {
        title,
        slug,
        headline,
        description,
        image:
          asString(body?.image) || "https://placehold.co/1200x675?text=Questie",
        bgImage:
          asString(body?.bg_image) ||
          "https://placehold.co/1600x900?text=Questie",
        status: asString(body?.status) || "pending",
      },
      include: courseInclude,
    });

    return json(mapCourse(course), { status: 201 });
  }

  if (method === "DELETE" && rest[0] === "category" && rest[1]) {
    const course = await findCourseByIdOrSlug(prisma, rest[1]);

    if (!course) {
      return errorResponse("Curso no encontrado.", 404);
    }

    const body = await parseJsonBody(request);
    const categoryId = asString(body?.categoryId);

    if (!categoryId) {
      return errorResponse("categoryId es obligatorio.");
    }

    await prisma.courseCategory.delete({
      where: {
        courseId_categoryId: {
          courseId: course.id,
          categoryId,
        },
      },
    });

    const updatedCourse = await prisma.course.findUnique({
      where: { id: course.id },
      include: courseInclude,
    });

    return json(mapCourse(updatedCourse));
  }

  if (!rest[0]) {
    return errorResponse("Ruta de cursos no soportada.", 404);
  }

  const existingCourse = await findCourseByIdOrSlug(prisma, rest[0]);

  if (!existingCourse) {
    return errorResponse("Curso no encontrado.", 404);
  }

  if (method === "GET") {
    return json(mapCourse(existingCourse));
  }

  if (method === "PUT") {
    if (isMultipartRequest(request)) {
      const formData = await request.formData();
      const title = asString(formData.get("title"));
      const headline = asString(formData.get("headline"));
      const description = asString(formData.get("description"));
      const nextImage = await fileToDataUrl(asFile(formData.get("courseImg")));
      const nextBgImage = await fileToDataUrl(
        asFile(formData.get("courseBgImg")),
      );

      const updatedCourse = await prisma.course.update({
        where: { id: existingCourse.id },
        data: {
          title: title || existingCourse.title,
          slug:
            title && title !== existingCourse.title
              ? await ensureCourseSlug(prisma, title, existingCourse.id)
              : existingCourse.slug,
          headline: headline || existingCourse.headline,
          description: description || existingCourse.description,
          image: nextImage || existingCourse.image,
          bgImage: nextBgImage || existingCourse.bgImage,
        },
        include: courseInclude,
      });

      return json(mapCourse(updatedCourse));
    }

    const body = await parseJsonBody(request);

    if (typeof body === "boolean") {
      const updatedCourse = await prisma.course.update({
        where: { id: existingCourse.id },
        data: { isProduct: body },
        include: courseInclude,
      });

      return json(mapCourse(updatedCourse));
    }

    if (Array.isArray(body?.categories)) {
      await setCourseCategories(prisma, existingCourse.id, body.categories);

      const updatedCourse = await prisma.course.findUnique({
        where: { id: existingCourse.id },
        include: courseInclude,
      });

      return json(mapCourse(updatedCourse));
    }

    const title = asString(body?.title);
    const updatedCourse = await prisma.course.update({
      where: { id: existingCourse.id },
      data: {
        ...(title ? { title } : {}),
        ...(title && title !== existingCourse.title
          ? { slug: await ensureCourseSlug(prisma, title, existingCourse.id) }
          : {}),
        ...(body?.headline ? { headline: asString(body.headline) } : {}),
        ...(body?.description
          ? { description: asString(body.description) }
          : {}),
        ...(typeof body?.status === "string" ? { status: body.status } : {}),
        ...(typeof body?.isProduct === "boolean"
          ? { isProduct: body.isProduct }
          : {}),
      },
      include: courseInclude,
    });

    return json(mapCourse(updatedCourse));
  }

  return errorResponse("Método no permitido.", 405);
};

const handleCategoriesRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (rest.length > 0) {
    return errorResponse("Ruta de categorías no soportada.", 404);
  }

  if (method === "GET") {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    return json(categories.map((category) => mapCategory(category)));
  }

  if (method === "POST") {
    const body = await parseJsonBody(request);
    const name = asString(body?.name);

    if (!name) {
      return errorResponse("El nombre de la categoría es obligatorio.");
    }

    const slug = await ensureCategorySlug(prisma, name);
    const category = await prisma.category.create({
      data: {
        name,
        slug,
        image:
          asString(body?.image) ||
          "https://placehold.co/600x400?text=Categoria",
      },
    });

    return json(mapCategory(category), { status: 201 });
  }

  return errorResponse("Método no permitido.", 405);
};

const handleModulesRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "GET" && rest.length === 0) {
    const modules = await prisma.module.findMany({
      include: moduleInclude,
      orderBy: { createdAt: "asc" },
    });

    return json(modules.map((module) => mapModule(module)));
  }

  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const payload = Array.isArray(body) ? body[0] : body;
    const title = asString(payload?.title);
    const description = asString(payload?.description);
    const courseIdentifier = asString(payload?.course_id);

    if (!title || !courseIdentifier) {
      return errorResponse("El módulo necesita título y course_id.");
    }

    const courseRecord = await findCourseByIdOrSlug(prisma, courseIdentifier);

    if (!courseRecord) {
      return errorResponse("Curso no encontrado.", 404);
    }

    const slug = await ensureModuleSlug(prisma, title);
    const moduleRecord = await prisma.module.create({
      data: {
        title,
        slug,
        description,
        courseId: courseRecord.id,
      },
      include: moduleInclude,
    });

    return json(mapModule(moduleRecord), { status: 201 });
  }

  if (!rest[0]) {
    return errorResponse("Ruta de módulos no soportada.", 404);
  }

  const existingModule = await findModuleByIdOrSlug(prisma, rest[0]);

  if (!existingModule) {
    return errorResponse("Módulo no encontrado.", 404);
  }

  if (method === "GET") {
    return json(mapModule(existingModule));
  }

  if (method === "PUT") {
    const body = await parseJsonBody(request);
    const payload = Array.isArray(body) ? body[0] : body;
    const title = asString(payload?.title);
    const description = asString(payload?.description);

    const updatedModule = await prisma.module.update({
      where: { id: existingModule.id },
      data: {
        ...(title ? { title } : {}),
        ...(title && title !== existingModule.title
          ? { slug: await ensureModuleSlug(prisma, title, existingModule.id) }
          : {}),
        ...(description ? { description } : {}),
      },
      include: moduleInclude,
    });

    return json(mapModule(updatedModule));
  }

  if (method === "DELETE") {
    await prisma.module.delete({ where: { id: existingModule.id } });
    return json({ message: "Módulo eliminado correctamente." });
  }

  return errorResponse("Método no permitido.", 405);
};

const handleLessonsRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "GET" && rest.length === 0) {
    const lessons = await prisma.lesson.findMany({
      include: lessonInclude,
      orderBy: [{ createdAt: "asc" }, { order: "asc" }],
    });

    return json(lessons.map((lesson) => mapLesson(lesson)));
  }

  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const payload = Array.isArray(body) ? body[0] : body;
    const title = asString(payload?.title);
    const moduleIdentifier = asString(payload?.module_id);

    if (!title || !moduleIdentifier) {
      return errorResponse("La lección necesita título y module_id.");
    }

    const moduleRecord = await findModuleByIdOrSlug(prisma, moduleIdentifier);

    if (!moduleRecord) {
      return errorResponse("Módulo no encontrado.", 404);
    }

    const requestedOrder = asNumber(payload?.order, 1);
    const orderAlreadyInUse = await prisma.lesson.findFirst({
      where: {
        moduleId: moduleRecord.id,
        order: requestedOrder,
      },
      select: { id: true },
    });
    const fallbackOrder =
      (await prisma.lesson.count({ where: { moduleId: moduleRecord.id } })) + 1;
    const slug = await ensureLessonSlug(prisma, title);

    const lesson = await prisma.lesson.create({
      data: {
        title,
        slug,
        order: orderAlreadyInUse ? fallbackOrder : requestedOrder,
        xp: asNumber(payload?.xp, 0),
        coins: asNumber(payload?.coins, 0),
        moduleId: moduleRecord.id,
        status: asString(payload?.status) || "pending",
      },
      include: lessonInclude,
    });

    return json(mapLesson(lesson), { status: 201 });
  }

  if (method === "PUT" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const entries = Array.isArray(body) ? body : [body];
    const updatedLessons = [];

    for (const entry of entries) {
      const lessonIdentifier = asString(entry?.id);
      const payload = entry?.updateLessonDto ?? entry;

      if (!lessonIdentifier || !payload) {
        continue;
      }

      const existingLesson = await findLessonByIdOrSlug(
        prisma,
        lessonIdentifier,
      );

      if (!existingLesson) {
        continue;
      }

      const nextTitle = asString(payload.title);
      const updatedLesson = await prisma.lesson.update({
        where: { id: existingLesson.id },
        data: {
          ...(nextTitle ? { title: nextTitle } : {}),
          ...(nextTitle && nextTitle !== existingLesson.title
            ? {
                slug: await ensureLessonSlug(
                  prisma,
                  nextTitle,
                  existingLesson.id,
                ),
              }
            : {}),
          ...(payload.order !== undefined
            ? { order: asNumber(payload.order, existingLesson.order) }
            : {}),
          ...(payload.xp !== undefined
            ? { xp: asNumber(payload.xp, existingLesson.xp) }
            : {}),
          ...(payload.coins !== undefined
            ? { coins: asNumber(payload.coins, existingLesson.coins) }
            : {}),
          ...(payload.status ? { status: asString(payload.status) } : {}),
        },
        include: lessonInclude,
      });

      updatedLessons.push(mapLesson(updatedLesson));
    }

    if (updatedLessons.length === 0) {
      return errorResponse("No se pudieron actualizar lecciones.", 400);
    }

    return json(
      updatedLessons.length === 1 ? updatedLessons[0] : updatedLessons,
    );
  }

  if (!rest[0]) {
    return errorResponse("Ruta de lecciones no soportada.", 404);
  }

  const existingLesson = await findLessonByIdOrSlug(prisma, rest[0]);

  if (!existingLesson) {
    return errorResponse("Lección no encontrada.", 404);
  }

  if (method === "GET") {
    return json(mapLesson(existingLesson));
  }

  if (method === "DELETE") {
    await prisma.lesson.delete({ where: { id: existingLesson.id } });
    return json({ message: "Lección eliminada correctamente." });
  }

  return errorResponse("Método no permitido.", 405);
};

const handleContentsRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const lessonIdentifier = asString(body?.lesson_id);
    const lesson = await findLessonByIdOrSlug(prisma, lessonIdentifier);

    if (!lesson) {
      return errorResponse("Lección no encontrada.", 404);
    }

    const entries = Array.isArray(body?.contents)
      ? body.contents
      : [body?.contents];
    const createdContents = [];

    for (const entry of entries) {
      const type = asString(entry?.type);
      const contentPayload = normalizeContentInput(
        type,
        (entry?.content ?? {}) as Record<string, unknown>,
      ) as Prisma.InputJsonValue;

      if (!type) {
        continue;
      }

      const content = await prisma.content.create({
        data: {
          lessonId: lesson.id,
          type,
          content: contentPayload,
        },
      });

      createdContents.push(content);
    }

    if (createdContents.length === 0) {
      return errorResponse("No se pudo crear contenido.", 400);
    }

    const mappedContents = createdContents.map(
      (content) =>
        mapLesson({
          ...lesson,
          contents: [content],
        }).contents[0],
    );

    return json(
      mappedContents.length === 1 ? mappedContents[0] : mappedContents,
      { status: 201 },
    );
  }

  if (method === "DELETE" && rest[0]) {
    await prisma.content.delete({ where: { id: rest[0] } });
    return json({ message: "Contenido eliminado correctamente." });
  }

  return errorResponse("Ruta de contenidos no soportada.", 404);
};

const handleProgressRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const userId = asString(body?.userId);
    const lessonIdentifier = asString(body?.lessonId);

    if (!userId || !lessonIdentifier) {
      return errorResponse("userId y lessonId son obligatorios.");
    }

    const lesson = await findLessonByIdOrSlug(prisma, lessonIdentifier);

    if (!lesson) {
      return errorResponse("Lección no encontrada.", 404);
    }

    const existingProgress = await prisma.progress.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId: lesson.id,
        },
      },
    });

    if (existingProgress) {
      return json(mapProgress(existingProgress));
    }

    const progress = await prisma.progress.create({
      data: {
        userId,
        lessonId: lesson.id,
      },
    });

    await prisma.stats.upsert({
      where: { userId },
      create: {
        userId,
        coins: lesson.coins,
        xp: lesson.xp,
      },
      update: {
        coins: {
          increment: lesson.coins,
        },
        xp: {
          increment: lesson.xp,
        },
      },
    });

    return json(mapProgress(progress), { status: 201 });
  }

  if (method === "GET" && rest[0] === "user" && rest[1]) {
    const progress = await prisma.progress.findMany({
      where: { userId: rest[1] },
      orderBy: { createdAt: "desc" },
    });

    return json(progress.map((entry) => mapProgress(entry)));
  }

  if (
    method === "GET" &&
    rest[0] === "course" &&
    rest[1] &&
    rest[2] === "user" &&
    rest[3]
  ) {
    const course = await findCourseByIdOrSlug(prisma, rest[1]);

    if (!course) {
      return errorResponse("Curso no encontrado.", 404);
    }

    const summary = await getCourseProgressSummary(prisma, course.id, rest[3]);
    return json(summary);
  }

  return errorResponse("Ruta de progreso no soportada.", 404);
};

const handleProductsRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "GET" && rest.length === 0) {
    const products = await prisma.product.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });

    return json(products.map((product) => mapProduct(product)));
  }

  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const product = await prisma.product.create({
      data: {
        name: asString(body?.name),
        description: asString(body?.description),
        price: asNumber(body?.price, 0),
        currency: asString(body?.currency) || "qty",
        order: asNumber(body?.order, 0),
        data: (body?.data as Prisma.InputJsonValue | undefined) ?? undefined,
        imgUrl:
          asString(body?.imgUrl) ||
          "https://placehold.co/1200x675?text=Producto",
        polymorphicEntityType: asString(body?.polymorphicEntityType) || null,
        polymorphicEntityId: asString(body?.polymorphicEntityId) || null,
      },
    });

    if (
      product.polymorphicEntityType === "Course" &&
      product.polymorphicEntityId
    ) {
      await prisma.course.update({
        where: { id: product.polymorphicEntityId },
        data: { isProduct: true },
      });
    }

    return json(mapProduct(product), { status: 201 });
  }

  if (!rest[0]) {
    return errorResponse("Ruta de productos no soportada.", 404);
  }

  const existingProduct = await prisma.product.findUnique({
    where: { id: rest[0] },
  });

  if (!existingProduct) {
    return errorResponse("Producto no encontrado.", 404);
  }

  if (method === "GET") {
    return json(mapProduct(existingProduct));
  }

  if (method === "PUT") {
    const body = await parseJsonBody(request);
    const updatedProduct = await prisma.product.update({
      where: { id: existingProduct.id },
      data: {
        ...(body?.name ? { name: asString(body.name) } : {}),
        ...(body?.description
          ? { description: asString(body.description) }
          : {}),
        ...(body?.price !== undefined
          ? { price: asNumber(body.price, existingProduct.price) }
          : {}),
        ...(body?.currency ? { currency: asString(body.currency) } : {}),
        ...(body?.imgUrl ? { imgUrl: asString(body.imgUrl) } : {}),
        ...(body?.data !== undefined
          ? { data: body.data as Prisma.InputJsonValue }
          : {}),
      },
    });

    return json(mapProduct(updatedProduct));
  }

  if (method === "DELETE") {
    await prisma.product.delete({ where: { id: existingProduct.id } });

    if (
      existingProduct.polymorphicEntityType === "Course" &&
      existingProduct.polymorphicEntityId
    ) {
      const remainingCourseProducts = await prisma.product.count({
        where: {
          polymorphicEntityType: "Course",
          polymorphicEntityId: existingProduct.polymorphicEntityId,
        },
      });

      if (remainingCourseProducts === 0) {
        await prisma.course.update({
          where: { id: existingProduct.polymorphicEntityId },
          data: { isProduct: false },
        });
      }
    }

    return json({ message: "Producto eliminado correctamente." });
  }

  return errorResponse("Método no permitido.", 405);
};

const handleEnrolmentsRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const course = await findCourseByIdOrSlug(prisma, asString(body?.courseId));
    const user = await findUserById(prisma, asString(body?.userId));

    if (!course || !user) {
      return errorResponse("Curso o usuario no encontrado.", 404);
    }

    const enrolment = await prisma.enrolment.upsert({
      where: {
        courseId_userId: {
          courseId: course.id,
          userId: user.id,
        },
      },
      create: {
        courseId: course.id,
        userId: user.id,
      },
      update: {},
    });

    return json(mapEnrolment(enrolment), { status: 201 });
  }

  if (method === "GET" && rest[0] === "user" && rest[1]) {
    const enrolments = await prisma.enrolment.findMany({
      where: { userId: rest[1] },
      orderBy: { createdAt: "desc" },
    });

    return json(enrolments.map((enrolment) => mapEnrolment(enrolment)));
  }

  if (method === "GET" && rest[0]) {
    const enrolment = await prisma.enrolment.findUnique({
      where: { id: rest[0] },
    });

    if (!enrolment) {
      return errorResponse("Inscripción no encontrada.", 404);
    }

    return json(mapEnrolment(enrolment));
  }

  return errorResponse("Ruta de inscripciones no soportada.", 404);
};

const handleInvoicesRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "GET" && rest.length === 0) {
    const invoices = await prisma.invoice.findMany({
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    });

    return json(invoices.map((invoice) => mapInvoice(invoice)));
  }

  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const user = await findUserById(prisma, asString(body?.userId));
    const product = await prisma.product.findUnique({
      where: { id: asString(body?.productId) },
    });

    if (!user || !product) {
      return errorResponse("Usuario o producto no encontrado.", 404);
    }

    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        productId: product.id,
        total: product.price,
        status: asString(body?.status) || "paid",
      },
      include: invoiceInclude,
    });

    return json(mapInvoice(invoice), { status: 201 });
  }

  if (method === "GET" && rest[0]) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: rest[0] },
      include: invoiceInclude,
    });

    if (!invoice) {
      return errorResponse("Factura no encontrada.", 404);
    }

    return json(mapInvoice(invoice));
  }

  return errorResponse("Ruta de facturas no soportada.", 404);
};

const handleSearchRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
) => {
  if (method !== "GET" || !rest[0]) {
    return errorResponse("Ruta de búsqueda no soportada.", 404);
  }

  const query = decodeURIComponent(rest.join("/")).trim();

  if (!query) {
    return json([]);
  }

  const [courses, modules, categories] = await Promise.all([
    prisma.course.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { headline: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true },
      take: 5,
    }),
    prisma.module.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true },
      take: 5,
    }),
    prisma.category.findMany({
      where: {
        name: { contains: query, mode: "insensitive" },
      },
      select: { id: true, name: true },
      take: 5,
    }),
  ]);

  const results = [
    ...courses.map((course) =>
      mapSearchResult({ id: course.id, type: "course", name: course.title }),
    ),
    ...modules.map((module) =>
      mapSearchResult({ id: module.id, type: "module", name: module.title }),
    ),
    ...categories.map((category) =>
      mapSearchResult({
        id: category.id,
        type: "category",
        name: category.name,
      }),
    ),
  ];

  return json(results);
};

const handleAssessmentRoutes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method === "GET" && rest[0] === "scores" && rest[1]) {
    const course = await findCourseByIdOrSlug(prisma, rest[1]);

    if (!course) {
      return errorResponse("Curso no encontrado.", 404);
    }

    const aggregate = await prisma.assessment.aggregate({
      where: { courseId: course.id },
      _avg: { score: true },
      _max: { score: true },
      _min: { score: true },
      _count: { score: true },
    });

    return json({
      averageScore: aggregate._avg.score ?? 0,
      totalAssessments: aggregate._count.score,
      maxScore: aggregate._max.score ?? 0,
      minScore: aggregate._min.score ?? 0,
    });
  }

  if (method === "POST" && rest.length === 0) {
    const body = await parseJsonBody(request);
    const course = await findCourseByIdOrSlug(prisma, asString(body?.courseId));
    const user = await findUserById(prisma, asString(body?.userId));
    const score = asNumber(body?.score, 0);

    if (!course || !user) {
      return errorResponse("Curso o usuario no encontrado.", 404);
    }

    if (score < 1 || score > 5) {
      return errorResponse("La valoración debe estar entre 1 y 5.");
    }

    const existingAssessment = await prisma.assessment.findUnique({
      where: {
        courseId_userId: {
          courseId: course.id,
          userId: user.id,
        },
      },
    });

    if (existingAssessment) {
      return errorResponse("Ya has valorado este curso.", 409);
    }

    const assessment = await prisma.assessment.create({
      data: {
        courseId: course.id,
        userId: user.id,
        score,
      },
    });

    await recalculateCourseAssessment(prisma, course.id);

    return json(assessment, { status: 201 });
  }

  return errorResponse("Ruta de assessment no soportada.", 404);
};

const handleUploadRoutes = async (request: NextRequest, method: string) => {
  if (method !== "POST") {
    return errorResponse("Método no permitido.", 405);
  }

  const formData = await request.formData();
  const url = await fileToDataUrl(asFile(formData.get("file")));

  if (!url) {
    return errorResponse("No se recibió ningún archivo.");
  }

  return json({ url }, { status: 201 });
};

const handlePaymentRoutes = async (rest: string[], method: string) => {
  if (method !== "POST" || !rest[0]) {
    return errorResponse("Ruta de pagos no soportada.", 404);
  }

  return errorResponse(
    `La integración ${rest[0]} todavía no se migró al entorno server-side de Next.js.`,
    501,
  );
};

const handleAuth0Routes = async (
  prisma: PrismaClient,
  rest: string[],
  method: string,
  request: NextRequest,
) => {
  if (method !== "POST" || rest[0] !== "register") {
    return errorResponse("Ruta Auth0 no soportada.", 404);
  }

  const body = await parseJsonBody(request);

  if (!body?.email) {
    return errorResponse("El email es obligatorio.");
  }

  const user = await syncAuth0User(prisma, {
    email: asString(body.email),
    username: asString(body.username),
    firstName: asString(body.firstName),
    lastName: asString(body.lastName),
    password: asString(body.password),
    birthdate: body.birthdate,
    profilePic: asString(body.profile_pic) || undefined,
  });

  return json(mapUser(user), { status: 201 });
};

export const handleQuestieApiRequest = async (
  request: NextRequest,
  segments: string[],
) => {
  if (!isDatabaseConfigured()) {
    return errorResponse(
      "DATABASE_URL no está configurada. Define tu conexión de Neon antes de usar la API interna.",
      500,
    );
  }

  const prisma = getPrisma();
  const [resource, ...rest] = segments;

  try {
    switch (resource) {
      case "users":
        return handleUsersRoutes(prisma, rest, request.method);
      case "stats":
        return handleStatsRoutes(prisma, rest, request.method, request);
      case "courses":
        return handleCoursesRoutes(prisma, rest, request.method, request);
      case "categories":
        return handleCategoriesRoutes(prisma, rest, request.method, request);
      case "modules":
        return handleModulesRoutes(prisma, rest, request.method, request);
      case "lessons":
        return handleLessonsRoutes(prisma, rest, request.method, request);
      case "contents":
        return handleContentsRoutes(prisma, rest, request.method, request);
      case "progress":
        return handleProgressRoutes(prisma, rest, request.method, request);
      case "products":
        return handleProductsRoutes(prisma, rest, request.method, request);
      case "enrolments":
        return handleEnrolmentsRoutes(prisma, rest, request.method, request);
      case "invoices":
        return handleInvoicesRoutes(prisma, rest, request.method, request);
      case "search":
        return handleSearchRoutes(prisma, rest, request.method);
      case "assessment":
        return handleAssessmentRoutes(prisma, rest, request.method, request);
      case "uploadfile":
        return handleUploadRoutes(request, request.method);
      case "payments":
        return handlePaymentRoutes(rest, request.method);
      case "auth0":
        return handleAuth0Routes(prisma, rest, request.method, request);
      default:
        return errorResponse(
          `La ruta /api/${segments.join("/")} no existe.`,
          404,
        );
    }
  } catch (error) {
    console.error(
      `[questie-api] ${request.method} /api/${segments.join("/")}`,
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Ocurrió un error inesperado en la API interna.",
      500,
    );
  }
};
