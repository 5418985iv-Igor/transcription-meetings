import fs from 'fs/promises';
import path from 'path';

/**
 * Loads a prompt from a file in the /prompts directory dynamically at runtime.
 * Never hardcodes the prompt content in source code.
 */
export async function loadPrompt(fileName: string): Promise<string> {
  const candidatePaths = [
    path.join(process.cwd(), 'prompts', fileName),
    path.join(__dirname, 'prompts', fileName),
    path.join(__dirname, '..', 'prompts', fileName),
    path.join(__dirname, '..', '..', 'prompts', fileName),
    path.join('/app', 'prompts', fileName),
  ];

  for (const filePath of candidatePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content !== undefined && content !== null) {
        return content.trim();
      }
    } catch {
      // try next candidate path
    }
  }

  throw new Error(
    `Не удалось загрузить файл промпта "${fileName}". Проверьте наличие директории prompts/ с файлом ${fileName}.`
  );
}

export async function getNormalizePrompt(): Promise<string> {
  return loadPrompt('normalize.txt');
}

export async function getMeetingProtocolPrompt(): Promise<string> {
  return loadPrompt('meeting_protocol.txt');
}
