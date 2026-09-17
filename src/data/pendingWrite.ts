export async function pendingWrite(write: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      write,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 10_000); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}