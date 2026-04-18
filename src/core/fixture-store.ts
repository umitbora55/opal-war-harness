import { readJsonFile } from './json.js';

export async function loadFixtureList<T>(path: string): Promise<T> {
  return readJsonFile<T>(path);
}
