import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

const CHUNK_SIZE = 1500;

export const secureDraftStorage: StateStorage = {
  async getItem(name) {
    const countValue = await SecureStore.getItemAsync(countKey(name));
    if (!countValue) {
      return SecureStore.getItemAsync(name);
    }

    const count = Number.parseInt(countValue, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(name, index)),
      ),
    );

    if (chunks.some((chunk) => chunk == null)) return null;
    return chunks.join("");
  },

  async setItem(name, value) {
    const previousCountValue = await SecureStore.getItemAsync(countKey(name));
    const previousCount = Number.parseInt(previousCountValue || "0", 10) || 0;
    const chunks = chunkString(value);

    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(name, index), chunk),
      ),
    );
    await SecureStore.setItemAsync(countKey(name), String(chunks.length));
    await SecureStore.deleteItemAsync(name);

    const staleDeletes = [];
    for (let index = chunks.length; index < previousCount; index += 1) {
      staleDeletes.push(SecureStore.deleteItemAsync(chunkKey(name, index)));
    }
    await Promise.all(staleDeletes);
  },

  async removeItem(name) {
    const countValue = await SecureStore.getItemAsync(countKey(name));
    const count = Number.parseInt(countValue || "0", 10) || 0;
    const deletes = [
      SecureStore.deleteItemAsync(name),
      SecureStore.deleteItemAsync(countKey(name)),
    ];

    for (let index = 0; index < count; index += 1) {
      deletes.push(SecureStore.deleteItemAsync(chunkKey(name, index)));
    }

    await Promise.all(deletes);
  },
};

function chunkString(value: string) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += CHUNK_SIZE) {
    chunks.push(value.slice(index, index + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

function countKey(name: string) {
  return `${name}:count`;
}

function chunkKey(name: string, index: number) {
  return `${name}:chunk:${index}`;
}

