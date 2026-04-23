const normalizeForSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const slugify = (value: string) => {
  const slug = normalizeForSlug(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "questie-item";
};

export const generateUniqueSlug = async (
  value: string,
  exists: (slug: string) => Promise<boolean>,
) => {
  const baseSlug = slugify(value);
  let candidate = baseSlug;
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};
