const toBase64 = async (file: File) =>
  Buffer.from(await file.arrayBuffer()).toString("base64");

export const fileToDataUrl = async (file: File | null | undefined) => {
  if (!file || file.size === 0) {
    return null;
  }

  const mimeType = file.type || "application/octet-stream";
  const base64 = await toBase64(file);

  return `data:${mimeType};base64,${base64}`;
};
