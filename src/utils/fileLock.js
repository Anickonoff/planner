let lock = Promise.resolve();

export async function withFileLock(fn) {
  const release = lock;
  let releaseNext;
  lock = new Promise((resolve) => (releaseNext = resolve));
  await release;

  try {
    return await fn();
  } finally {
    releaseNext();
  }
}
