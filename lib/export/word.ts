import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';

export interface ExportWordOptions {
  protocolText: string;
  fileName?: string;
  meetingDate?: string | number | Date;
  taskId?: string;
  documentType?: 'protocol' | 'normalized' | 'raw';
}

/**
 * Strips invalid XML 1.0 control characters that can corrupt docx packages,
 * while preserving valid Cyrillic, whitespace, tabs, and line breaks.
 */
function cleanXmlString(str: string): string {
  if (!str) return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Parses inline markdown formatted text (such as **bold**, *italic*, and regular text)
 * into an array of docx TextRun instances, preserving Cyrillic text encoding and font styling.
 */
function parseInlineFormatting(text: string, baseFont = 'Calibri', baseSize = 22): TextRun[] {
  const sanitized = cleanXmlString(text);
  const runs: TextRun[] = [];
  // Tokenize **bold** and *italic*
  const tokens = sanitized.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      runs.push(
        new TextRun({
          text: token.slice(2, -2),
          bold: true,
          font: baseFont,
          size: baseSize,
          color: '0F172A',
        })
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          italics: true,
          font: baseFont,
          size: baseSize,
          color: '334155',
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: token,
          font: baseFont,
          size: baseSize,
          color: '334155',
        })
      );
    }
  }

  return runs.length > 0
    ? runs
    : [
        new TextRun({
          text: sanitized,
          font: baseFont,
          size: baseSize,
          color: '334155',
        }),
      ];
}

/**
 * Parses a markdown table into a docx Table element
 */
function createDocxTable(tableLines: string[]): Table | null {
  if (tableLines.length < 2) return null;

  const rows: TableRow[] = [];
  const parseRowCells = (line: string): string[] => {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  };

  const headerCells = parseRowCells(tableLines[0]);
  if (headerCells.length === 0) return null;

  // Header row
  rows.push(
    new TableRow({
      tableHeader: true,
      children: headerCells.map(
        (cellText) =>
          new TableCell({
            shading: { fill: 'F1F5F9' },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cleanXmlString(cellText),
                    bold: true,
                    font: 'Calibri',
                    size: 20,
                    color: '1E293B',
                  }),
                ],
              }),
            ],
          })
      ),
    })
  );

  // Body rows (skip separator line like |---|---|)
  for (let r = 1; r < tableLines.length; r++) {
    const rawLine = tableLines[r].trim();
    if (/^[|\s:-]+$/.test(rawLine)) continue; // separator row

    const cells = parseRowCells(rawLine);
    rows.push(
      new TableRow({
        children: cells.map(
          (cellText) =>
            new TableCell({
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: [
                new Paragraph({
                  children: parseInlineFormatting(cellText, 'Calibri', 20),
                }),
              ],
            })
        ),
      })
    );
  }

  if (rows.length === 0) return null;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

/**
 * Generates a Microsoft Word (.docx) document from markdown meeting protocol text.
 * Strictly respects UTF-8 Cyrillic encoding and Russian typographic conventions.
 */
export async function generateMeetingProtocolDocx({
  protocolText,
  fileName = 'Совещание',
  meetingDate = new Date(),
  taskId,
  documentType = 'protocol',
}: ExportWordOptions): Promise<Blob> {
  const formattedDate = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof meetingDate === 'object' ? meetingDate : new Date(meetingDate));

  const contentElements: (Paragraph | Table)[] = [];

  // Top Corporate Subtitle & Brand Tag
  contentElements.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: 'КОМПАНИЯ «Ю-ТЕРМ»',
          bold: true,
          font: 'Calibri',
          size: 18,
          color: '4F46E5', // Indigo brand
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: 'Служба протоколирования совещаний',
          italics: true,
          font: 'Calibri',
          size: 16,
          color: '64748B',
        }),
      ],
    })
  );

  // Metadata Card / Callout block in Word
  contentElements.push(
    new Paragraph({
      spacing: { before: 80, after: 80 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: 'E2E8F0',
          space: 6,
        },
      },
      children: [
        new TextRun({
          text: 'Дата фиксации: ',
          bold: true,
          font: 'Calibri',
          size: 20,
          color: '1E293B',
        }),
        new TextRun({
          text: formattedDate,
          font: 'Calibri',
          size: 20,
          color: '334155',
        }),
        new TextRun({
          text: '    |    Файл записи: ',
          bold: true,
          font: 'Calibri',
          size: 20,
          color: '1E293B',
        }),
        new TextRun({
          text: cleanXmlString(fileName),
          font: 'Calibri',
          size: 20,
          color: '334155',
        }),
      ],
    })
  );

  if (taskId && !taskId.startsWith('temp_')) {
    contentElements.push(
      new Paragraph({
        spacing: { after: 220 },
        children: [
          new TextRun({
            text: 'Идентификатор задачи: ',
            font: 'Calibri',
            size: 18,
            color: '64748B',
          }),
          new TextRun({
            text: taskId,
            font: 'Consolas',
            size: 18,
            color: '4F46E5',
          }),
        ],
      })
    );
  } else {
    contentElements.push(
      new Paragraph({
        spacing: { after: 180 },
        children: [],
      })
    );
  }

  // Parse lines from markdown protocol
  const lines = cleanXmlString(protocolText).split(/\r?\n/);
  let tableBuffer: string[] = [];

  const flushTableBuffer = () => {
    if (tableBuffer.length > 0) {
      const table = createDocxTable(tableBuffer);
      if (table) {
        contentElements.push(table);
        contentElements.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
      }
      tableBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check if table row
    if (line.startsWith('|') && line.endsWith('|')) {
      tableBuffer.push(line);
      continue;
    } else {
      flushTableBuffer();
    }

    if (!line) {
      // Empty line -> paragraph spacing
      contentElements.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [],
        })
      );
      continue;
    }

    // Main document title: # Title
    if (line.startsWith('# ')) {
      const headingText = line.slice(2).trim();
      contentElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 180 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              font: 'Calibri',
              size: 32, // 16pt
              color: '0F172A',
            }),
          ],
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 18,
              color: '4F46E5',
              space: 8,
            },
          },
        })
      );
      continue;
    }

    // Section title: ## 1. Тема совещания or ## 2. ...
    if (line.startsWith('## ')) {
      const headingText = line.slice(3).trim();
      contentElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 260, after: 120 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              font: 'Calibri',
              size: 26, // 13pt
              color: '1E293B',
            }),
          ],
        })
      );
      continue;
    }

    // Subsection title: ### ...
    if (line.startsWith('### ')) {
      const headingText = line.slice(4).trim();
      contentElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 180, after: 100 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              font: 'Calibri',
              size: 24, // 12pt
              color: '334155',
            }),
          ],
        })
      );
      continue;
    }

    // Bullet points: - item or * item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const itemContent = line.slice(2).trim();
      const inlineRuns = parseInlineFormatting(itemContent, 'Calibri', 22);

      contentElements.push(
        new Paragraph({
          bullet: {
            level: 0,
          },
          spacing: { after: 100 },
          children: inlineRuns,
        })
      );
      continue;
    }

    // Numbered list item: 1. Item
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const [, num, itemContent] = numberedMatch;
      const inlineRuns = parseInlineFormatting(itemContent, 'Calibri', 22);

      contentElements.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `${num}. `,
              bold: true,
              font: 'Calibri',
              size: 22,
              color: '1E293B',
            }),
            ...inlineRuns,
          ],
        })
      );
      continue;
    }

    // Standard paragraph line
    const inlineRuns = parseInlineFormatting(line, 'Calibri', 22);
    contentElements.push(
      new Paragraph({
        spacing: { after: 130 },
        children: inlineRuns,
      })
    );
  }

  // Flush any remaining table at the end
  flushTableBuffer();

  // Closing corporate tagline
  contentElements.push(
    new Paragraph({
      spacing: { before: 360, after: 120 },
      border: {
        top: {
          style: BorderStyle.DASHED,
          size: 6,
          color: 'CBD5E1',
          space: 12,
        },
      },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '«Разговор закончился — результат остался»',
          italics: true,
          font: 'Calibri',
          size: 20,
          color: '64748B',
        }),
      ],
    })
  );

  // Construct Document with explicit Cyrillic language tag and standard page setup
  const docTitle =
    documentType === 'protocol'
      ? `Протокол совещания — ${fileName}`
      : `Материалы совещания — ${fileName}`;

  const doc = new Document({
    creator: 'Ю-Терм Протоколы',
    title: docTitle,
    description: 'Официальный протокол совещания компании Ю-Терм',
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22, // 11pt
            color: '334155',
            language: {
              value: 'ru-RU',
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch (25.4 mm)
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Ю-Терм • Протокол совещания',
                    font: 'Calibri',
                    size: 16,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Стр. ',
                    font: 'Calibri',
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Calibri',
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    text: ' из ',
                    font: 'Calibri',
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'Calibri',
                    size: 16,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        children: contentElements,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * Convenience helper to download the generated .docx file directly in browser.
 */
export async function downloadMeetingProtocolDocx(options: ExportWordOptions): Promise<void> {
  const blob = await generateMeetingProtocolDocx(options);
  const baseName = (options.fileName || 'meeting_protocol').replace(/\.[^/.]+$/, '');
  const suffix =
    options.documentType === 'normalized'
      ? 'нормализованный_текст'
      : options.documentType === 'raw'
      ? 'стенограмма'
      : 'протокол';

  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `${baseName}_${suffix}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
