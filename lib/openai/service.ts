import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getNormalizePrompt, getMeetingProtocolPrompt } from '../prompts/loader';

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

function getModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna';
}

/**
 * Normalizes speech-to-text output using OpenAI or Gemini fallback and the prompt from prompts/normalize.txt
 */
export async function normalizeTranscription(rawText: string): Promise<string> {
  if (!rawText || !rawText.trim()) {
    return '';
  }

  // Load the prompt from file dynamically
  const systemPrompt = await getNormalizePrompt();

  const client = getOpenAIClient();
  if (client) {
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
          // continue to gemini fallback or rethrow
        }
      }
      // If OpenAI failed, check if Gemini is available as fallback
      const gemini = getGeminiClient();
      if (!gemini) {
        throw new Error(`Ошибка нормализации текста через OpenAI: ${errMsg}`);
      }
    }
  }

  // Gemini client fallback
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Исходная стенограмма аудиозаписи:\n\n${rawText}`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
        },
      });
      const text = response.text?.trim();
      if (text) return text;
      throw new Error('Пустой ответ от Gemini при нормализации');
    } catch (gErr: unknown) {
      const gMsg = gErr instanceof Error ? gErr.message : String(gErr);
      throw new Error(`Ошибка нормализации текста: ${gMsg}`);
    }
  }

  throw new Error(
    'Переменная OPENAI_API_KEY или GEMINI_API_KEY не задана. Укажите ключ в настройках окружения (.env).'
  );
}

/**
 * Generates meeting minutes/protocol using OpenAI or Gemini fallback and the prompt from prompts/meeting_protocol.txt
 */
export async function generateMeetingProtocol(normalizedText: string): Promise<string> {
  if (!normalizedText || !normalizedText.trim()) {
    return '';
  }

  // Load the prompt from file dynamically
  const systemPrompt = await getMeetingProtocolPrompt();

  const client = getOpenAIClient();
  if (client) {
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
          // continue
        }
      }
      const gemini = getGeminiClient();
      if (!gemini) {
        throw new Error(`Ошибка формирования протокола через OpenAI: ${errMsg}`);
      }
    }
  }

  // Gemini client fallback
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Нормализованный текст стенограммы встречи:\n\n${normalizedText}`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
        },
      });
      const text = response.text?.trim();
      if (text) return text;
      throw new Error('Пустой ответ от Gemini при формировании протокола');
    } catch (gErr: unknown) {
      const gMsg = gErr instanceof Error ? gErr.message : String(gErr);
      throw new Error(`Ошибка формирования протокола: ${gMsg}`);
    }
  }

  throw new Error(
    'Переменная OPENAI_API_KEY или GEMINI_API_KEY не задана. Укажите ключ в настройках окружения (.env).'
  );
}
