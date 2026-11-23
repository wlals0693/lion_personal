// Keep photo bytes out of the small localStorage quota used by the wardrobe.
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wardrobe-evaluation', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readEvaluation(): Promise<string | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('sets').objectStore('sets').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
let writes: Promise<void> = Promise.resolve();
export function writeEvaluation(value: string): Promise<void> {
  const write = writes
    .catch(() => {})
    .then(async () => {
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('sets', 'readwrite');
          tx.objectStore('sets').put(value, 'current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  writes = write;
  return write;
}
