import OpenAI from 'openai';
import { getNormalizePrompt, getMeetingProtocolPrompt } from '../prompts/loader';

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

function getModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna';
}

/**
 * Normalizes speech-to-text output using OpenAI and the prompt from prompts/normalize.txt
 */
export async function normalizeTranscription(rawText: string): Promise<string> {
  if (!rawText || !rawText.trim()) {
    return '';
  }

  const client = getOpenAIClient();
  if (!client) {
    throw new Error(
      'Переменная OPENAI_API_KEY не задана. Укажите ключ в настройках окружения (.env).'
    );
  }

  // Load the prompt from file dynamically
  const systemPrompt = await getNormalizePrompt();
  const primaryModel = getModelName();

  try {
    const response = await client.chat.completions.create({
      model: primaryModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Исходная стенограмма аудиозаписи:\n\n${rawText}`,
        },
      ],
      temperature: 0.2,
    });

    const normalized = response.choices[0]?.message?.content?.trim();
    if (!normalized) {
      throw new Error('Пустой ответ от модели нормализации');
    }
    return normalized;
  } catch (err: unknown) {
    // If the configured model is unavailable (e.g., custom model name), fallback gracefully
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('model') || errMsg.includes('not found') || errMsg.includes('404')) {
      // Fallback attempt with gpt-4o-mini
      try {
        const fallbackResponse = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Исходная стенограмма аудиозаписи:\n\n${rawText}`,
            },
          ],
          temperature: 0.2,
        });
        const fallbackText = fallbackResponse.choices[0]?.message?.content?.trim();
        if (fallbackText) return fallbackText;
      } catch {
        // rethrow original
      }
    }
    throw new Error(`Ошибка нормализации текста через OpenAI: ${errMsg}`);
  }
}

/**
 * Generates meeting minutes/protocol using OpenAI and the prompt from prompts/meeting_protocol.txt
 */
export async function generateMeetingProtocol(normalizedText: string): Promise<string> {
  if (!normalizedText || !normalizedText.trim()) {
    return '';
  }

  const client = getOpenAIClient();
  if (!client) {
    throw new Error(
      'Переменная OPENAI_API_KEY не задана. Укажите ключ в настройках окружения (.env).'
    );
  }

  // Load the prompt from file dynamically
  const systemPrompt = await getMeetingProtocolPrompt();
  const primaryModel = getModelName();

  try {
    const response = await client.chat.completions.create({
      model: primaryModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Нормализованный текст стенограммы встречи:\n\n${normalizedText}`,
        },
      ],
      temperature: 0.3,
    });

    const protocol = response.choices[0]?.message?.content?.trim();
    if (!protocol) {
      throw new Error('Пустой ответ от модели формирования протокола');
    }
    return protocol;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('model') || errMsg.includes('not found') || errMsg.includes('404')) {
      // Fallback attempt with gpt-4o-mini
      try {
        const fallbackResponse = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Нормализованный текст стенограммы встречи:\n\n${normalizedText}`,
            },
          ],
          temperature: 0.3,
        });
        const fallbackText = fallbackResponse.choices[0]?.message?.content?.trim();
        if (fallbackText) return fallbackText;
      } catch {
        // rethrow original
      }
    }
    throw new Error(`Ошибка формирования протокола через OpenAI: ${errMsg}`);
  }
}
