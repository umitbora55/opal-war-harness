import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import YAML from 'yaml';

export async function readStructuredFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf8');
  if (extname(filePath).toLowerCase() === '.json') {
    return JSON.parse(content) as T;
  }
  return YAML.parse(content) as T;
}

