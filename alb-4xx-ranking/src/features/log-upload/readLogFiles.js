export async function readLogFiles(files) {
  const texts = [];
  for (const file of files) {
    texts.push(await readLogFileAsText(file));
  }
  return texts.join("\n");
}

async function readLogFileAsText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isGzip = file.name.endsWith(".gz") || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  if (!isGzip) return new TextDecoder().decode(bytes);

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    throw new Error(`${file.name} を gzip として展開できませんでした。`);
  }
}
