export async function pendingWrite(write: Promise<unknown>, waitMs = 10_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      write,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}