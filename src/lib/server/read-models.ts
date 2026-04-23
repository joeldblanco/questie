import "server-only";

import { getPrisma } from "@/lib/prisma";
import {
  mapCategory,
  mapCourse,
  mapModule,
  mapProduct,
} from "@/lib/server/mappers";

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

export const getCoursesForPage = async (onlyComplete = true) => {
  const prisma = getPrisma();
  const courses = await prisma.course.findMany({
    where: onlyComplete ? { status: "complete" } : undefined,
    include: courseInclude,
    orderBy: { createdAt: "desc" },
  });

  return courses.map((course) => mapCourse(course));
};

export const getCourseByIdOrSlugForPage = async (identifier: string) => {
  const prisma = getPrisma();
  const course = await prisma.course.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    include: courseInclude,
  });

  if (!course) {
    throw new Error("Curso no encontrado.");
  }

  return mapCourse(course);
};

export const getCategoriesForPage = async () => {
  const prisma = getPrisma();
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });

  return categories.map((category) => mapCategory(category));
};

export const getModuleByIdOrSlugForPage = async (identifier: string) => {
  const prisma = getPrisma();
  const moduleRecord = await prisma.module.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    include: moduleInclude,
  });

  if (!moduleRecord) {
    throw new Error("Módulo no encontrado.");
  }

  return mapModule(moduleRecord);
};

export const getProductsForPage = async (
  mode: "all" | "course" | "standalone" = "all",
) => {
  const prisma = getPrisma();
  const where =
    mode === "course"
      ? { polymorphicEntityType: "Course" }
      : mode === "standalone"
        ? {
            OR: [
              { polymorphicEntityType: null },
              { polymorphicEntityType: { not: "Course" } },
            ],
          }
        : undefined;

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  return products.map((product) => mapProduct(product));
};
