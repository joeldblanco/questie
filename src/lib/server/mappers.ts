const toNullableIsoString = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
};

const toIsoString = (value: Date | string | null | undefined) =>
  toNullableIsoString(value) ?? "";

const ensureContentAliases = (
  payload: Record<string, unknown>,
  type?: string,
) => {
  const normalized = { ...payload } as Record<string, unknown>;

  if (type === "image" || normalized.image || normalized.image_url) {
    const imageValue = normalized.image ?? normalized.image_url ?? "";
    normalized.image = imageValue;
    normalized.image_url = imageValue;
  }

  if (type === "video" || normalized.video || normalized.video_url) {
    const videoValue = normalized.video ?? normalized.video_url ?? "";
    normalized.video = videoValue;
    normalized.video_url = videoValue;
  }

  return normalized;
};

export const mapStats = (stats: any) => {
  if (!stats) {
    return undefined;
  }

  return {
    id: stats.id,
    coins: stats.coins,
    xp: stats.xp,
    user: stats.userId,
    created_at: toIsoString(stats.createdAt),
    updated_at: toIsoString(stats.updatedAt),
  };
};

export const mapContent = (content: any) => {
  const normalizedContent = ensureContentAliases(
    content.content ?? {},
    content.type,
  );

  return {
    id: content.id,
    lesson_id: content.lessonId,
    type: content.type,
    content: normalizedContent,
    created_at: toIsoString(content.createdAt),
    updated_at: toIsoString(content.updatedAt),
    deleted_at: toNullableIsoString(content.deletedAt),
  };
};

export const mapLesson = (lesson: any, parentModule?: any) => {
  const moduleInfo = parentModule ?? lesson.module ?? null;
  const mappedContents = Array.isArray(lesson.contents)
    ? lesson.contents.map((content: any) => mapContent(content))
    : [];

  return {
    id: lesson.id,
    title: lesson.title,
    slug: lesson.slug,
    order: lesson.order,
    xp: lesson.xp,
    coins: lesson.coins,
    status: lesson.status,
    module_id: lesson.moduleId,
    module: {
      id: moduleInfo?.id ?? lesson.moduleId,
      course: {
        id: moduleInfo?.courseId ?? moduleInfo?.course?.id ?? "",
      },
    },
    contents: mappedContents,
    content: mappedContents.map(
      (content: { content: unknown }) => content.content,
    ),
    created_at: toIsoString(lesson.createdAt),
    updated_at: toIsoString(lesson.updatedAt),
    deleted_at: toNullableIsoString(lesson.deletedAt),
  };
};

export const mapModule = (module: any, parentCourse?: any) => {
  const mappedLessons = Array.isArray(module.lessons)
    ? module.lessons.map((lesson: any) => mapLesson(lesson, module))
    : [];

  return {
    id: module.id,
    title: module.title,
    slug: module.slug,
    image: module.image,
    description: module.description,
    lessons: mappedLessons,
    course: {
      id: module.courseId ?? parentCourse?.id ?? module.course?.id ?? "",
    },
    created_at: toIsoString(module.createdAt),
    updated_at: toIsoString(module.updatedAt),
    deleted_at: toNullableIsoString(module.deletedAt),
  };
};

export const mapCategory = (category: any) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  image: category.image,
  created_at: toIsoString(category.createdAt),
  updated_at: toIsoString(category.updatedAt),
  deleted_at: toNullableIsoString(category.deletedAt),
});

export const mapCourse = (course: any) => ({
  id: course.id,
  title: course.title,
  slug: course.slug,
  headline: course.headline,
  description: course.description,
  image: course.image,
  bg_image: course.bgImage,
  assessment: course.assessment,
  status: course.status,
  isProduct: course.isProduct,
  create_at: toIsoString(course.createdAt),
  created_at: toIsoString(course.createdAt),
  updated_at: toIsoString(course.updatedAt),
  deleted_at: toNullableIsoString(course.deletedAt),
  modules: Array.isArray(course.modules)
    ? course.modules.map((module: any) => mapModule(module, course))
    : [],
  categories: Array.isArray(course.categories)
    ? course.categories.map((item: any) => mapCategory(item.category ?? item))
    : [],
});

export const mapProduct = (product: any) => ({
  id: product.id,
  name: product.name,
  order: product.order,
  data: product.data ?? undefined,
  price: product.price,
  imgUrl: product.imgUrl,
  currency: product.currency,
  description: product.description,
  polymorphicEntityType: product.polymorphicEntityType ?? undefined,
  polymorphicEntityId: product.polymorphicEntityId ?? undefined,
  created_at: toIsoString(product.createdAt),
  updated_at: toIsoString(product.updatedAt),
  deleted_at: toNullableIsoString(product.deletedAt),
});

export const mapInvoice = (invoice: any) => ({
  id: invoice.id,
  userId: invoice.userId,
  user_id: invoice.userId,
  total: invoice.total,
  productId: invoice.productId,
  product_id: invoice.productId,
  status: invoice.status,
  product: invoice.product ? mapProduct(invoice.product) : undefined,
  user: {
    id: invoice.userId,
  },
  created_at: toIsoString(invoice.createdAt),
  updated_at: toIsoString(invoice.updatedAt),
  deleted_at: toNullableIsoString(invoice.deletedAt),
});

export const mapEnrolment = (enrolment: any) => ({
  id: enrolment.id,
  course: enrolment.courseId,
  course_id: enrolment.courseId,
  user: enrolment.userId,
  user_id: enrolment.userId,
  progress_id: enrolment.progressId,
  created_at: toIsoString(enrolment.createdAt),
  updated_at: toIsoString(enrolment.updatedAt),
  deleted_at: toNullableIsoString(enrolment.deletedAt),
});

export const mapProgress = (progress: any) => ({
  id: progress.id,
  userId: progress.userId,
  lessonId: progress.lessonId,
  created_at: toIsoString(progress.createdAt),
});

export const mapUser = (user: any) => ({
  id: user.id,
  username: user.username,
  password: "",
  email: user.email,
  profile_pic: user.profilePic,
  firstName: user.firstName,
  lastName: user.lastName,
  birthdate: toIsoString(user.birthdate),
  role: user.role,
  stats: mapStats(user.stats),
  created_at: toIsoString(user.createdAt),
  updated_at: toIsoString(user.updatedAt),
  deleted_at: toNullableIsoString(user.deletedAt),
});

export const mapSearchResult = (result: {
  id: string;
  type: string;
  name: string;
}) => ({
  id: result.id,
  type: result.type,
  name: result.name,
});
