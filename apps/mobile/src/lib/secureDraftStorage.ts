import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

const CHUNK_SIZE = 1500;

export const secureDraftStorage: StateStorage = {
  async getItem(name) {
    try {
      const countValue = await SecureStore.getItemAsync(countKey(name));
      if (!countValue) {
        return SecureStore.getItemAsync(storageKey(name));
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
    } catch {
      return null;
    }
  },

  async setItem(name, value) {
    try {
      const previousCountValue = await SecureStore.getItemAsync(countKey(name));
      const previousCount = Number.parseInt(previousCountValue || "0", 10) || 0;
      const chunks = chunkString(value);

      await Promise.all(
        chunks.map((chunk, index) =>
          SecureStore.setItemAsync(chunkKey(name, index), chunk),
        ),
      );
      await SecureStore.setItemAsync(countKey(name), String(chunks.length));
      await SecureStore.deleteItemAsync(storageKey(name));

      const staleDeletes = [];
      for (let index = chunks.length; index < previousCount; index += 1) {
        staleDeletes.push(SecureStore.deleteItemAsync(chunkKey(name, index)));
      }
      await Promise.all(staleDeletes);
    } catch {
      // Draft persistence should never block the onboarding form.
    }
  },

  async removeItem(name) {
    try {
      const countValue = await SecureStore.getItemAsync(countKey(name));
      const count = Number.parseInt(countValue || "0", 10) || 0;
      const deletes = [
        SecureStore.deleteItemAsync(storageKey(name)),
        SecureStore.deleteItemAsync(countKey(name)),
      ];

      for (let index = 0; index < count; index += 1) {
        deletes.push(SecureStore.deleteItemAsync(chunkKey(name, index)));
      }

      await Promise.all(deletes);
    } catch {
      // Nothing useful to do if secure storage rejects cleanup.
    }
  },
};

function chunkString(value: string) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += CHUNK_SIZE) {
    chunks.push(value.slice(index, index + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

function storageKey(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

function countKey(name: string) {
  return `${storageKey(name)}.count`;
}

function chunkKey(name: string, index: number) {
  return `${storageKey(name)}.chunk.${index}`;
}
