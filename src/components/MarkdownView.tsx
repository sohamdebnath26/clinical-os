import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

/**
 * Balances any unclosed ** or * tokens at the end of a line/string
 * (e.g. during live streaming or minor LLM formatting omissions)
 * so raw asterisks never flash on screen.
 */
function balanceInlineMarkers(input: string): string {
  if (!input) return '';
  let text = input;

  // Balance triple asterisks ***
  const tripleCount = (text.match(/\*\*\*/g) || []).length;
  if (tripleCount % 2 === 1) {
    text += '***';
    return text;
  }

  // Balance double asterisks **
  const withoutTriple = text.replace(/\*\*\*/g, '');
  const doubleCount = (withoutTriple.match(/\*\*/g) || []).length;
  if (doubleCount % 2 === 1) {
    text += '**';
  }

  // Balance single asterisks * (ignoring ** and ***)
  const withoutDouble = text.replace(/\*\*+/g, '');
  const singleCount = (withoutDouble.match(/\*/g) || []).length;
  if (singleCount % 2 === 1) {
    // Only auto-close if there is non-space text after the last *
    const lastIdx = text.lastIndexOf('*');
    if (lastIdx !== -1 && lastIdx < text.length - 1 && !/\*\s/.test(text.slice(lastIdx, lastIdx + 2))) {
      text += '*';
    }
  }

  return text;
}

/**
 * Recursively parses inline markdown tokens:
 * - ***bold & italic*** or ___bold & italic___
 * - **bold** or __bold__ (recursively supports nested *italic* or `code` inside!)
 * - *italic* or _italic_ (recursively supports nested **bold** or `code` inside!)
 * - `inline code`
 */
export function renderInlineMarkdown(rawText: string, keyPrefix = 'inl'): React.ReactNode[] {
  if (!rawText) return [];
  const text = balanceInlineMarkers(rawText);

  // Order matters:
  // 1. Inline code: `([^`]+)`
  // 2. Bold + Italic: \*\*\*(.+?)\*\*\* or ___(.+?)___
  // 3. Bold: \*\*(.+?)\*\* or __(.+?)__
  // 4. Italic: \*([^*]+?)\* or (?<![a-zA-Z0-9])_([^_]+?)_(?![a-zA-Z0-9])
  const tokenRegex =
    /(`[^`]+`|\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*[^\s*][^*]*?\*|\*[^\s*]\*|(?<![a-zA-Z0-9])_[^\s_][^_]*?_(?![a-zA-Z0-9]))/g;

  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-${index}`;

    // 1. Inline code `...`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={key}
          className="font-mono text-[11px] bg-teal-50 text-teal-900 border border-teal-200/80 px-1.5 py-0.5 rounded font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // 2. Bold + Italic ***...*** or ___...___
    if (
      ((part.startsWith('***') && part.endsWith('***')) ||
        (part.startsWith('___') && part.endsWith('___'))) &&
      part.length > 6
    ) {
      const inner = part.slice(3, -3);
      return (
        <strong key={key} className="font-bold italic text-slate-900">
          {renderInlineMarkdown(inner, `${key}-bi`)}
        </strong>
      );
    }

    // 3. Bold **...** or __...__ (supports nested *italic* inside!)
    if (
      ((part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))) &&
      part.length > 4
    ) {
      const inner = part.slice(2, -2);
      return (
        <strong key={key} className="font-bold text-slate-900">
          {renderInlineMarkdown(inner, `${key}-b`)}
        </strong>
      );
    }

    // 4. Italic *...* or _..._
    if (
      ((part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))) &&
      part.length > 2
    ) {
      const inner = part.slice(1, -1);
      return (
        <em key={key} className="italic text-slate-700 font-medium">
          {renderInlineMarkdown(inner, `${key}-i`)}
        </em>
      );
    }

    // Clean any stray孤立 double-asterisks if present
    return <React.Fragment key={key}>{part.replace(/\*\*/g, '')}</React.Fragment>;
  });
}

interface BulletListItem {
  text: string;
  indent: boolean;
}

interface OrderedListItem {
  num: string;
  text: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];

  let currentUl: BulletListItem[] | null = null;
  let currentOl: OrderedListItem[] | null = null;
  let currentTable: string[][] | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const flushUl = () => {
    if (currentUl && currentUl.length > 0) {
      const items = currentUl;
      currentUl = null;
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 space-y-1.5 pl-1">
          {items.map((item, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 text-xs text-slate-700 leading-relaxed ${
                item.indent ? 'pl-4' : ''
              }`}
            >
              <span
                className={
                  item.indent
                    ? 'w-1.5 h-1.5 rounded-full border border-teal-600 mt-1.5 shrink-0'
                    : 'w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0'
                }
              />
              <span className="flex-1">{renderInlineMarkdown(item.text, `ul-${elements.length}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
    }
  };

  const flushOl = () => {
    if (currentOl && currentOl.length > 0) {
      const items = currentOl;
      currentOl = null;
      elements.push(
        <ol key={`ol-${elements.length}`} className="my-2 space-y-1.5 pl-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
              <span className="font-mono font-bold text-teal-800 bg-teal-50 border border-teal-200/70 rounded px-1.5 py-0.2 text-[10px] mt-0.5 shrink-0">
                {item.num}.
              </span>
              <span className="flex-1">{renderInlineMarkdown(item.text, `ol-${elements.length}-${i}`)}</span>
            </li>
          ))}
        </ol>
      );
    }
  };

  const flushTable = () => {
    if (currentTable && currentTable.length > 0) {
      const rows = currentTable;
      currentTable = null;
      const header = rows[0];
      const bodyRows = rows.slice(1);
      elements.push(
        <div
          key={`tbl-${elements.length}`}
          className="my-2.5 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-teal-50/80 border-b border-slate-200 text-teal-950">
                {header.map((cell, cIdx) => (
                  <th key={cIdx} className="px-3 py-2 font-bold text-[11px] uppercase tracking-wider">
                    {renderInlineMarkdown(cell, `th-${elements.length}-${cIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700 leading-relaxed align-top">
                      {renderInlineMarkdown(cell, `td-${elements.length}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  };

  const flushAll = () => {
    flushUl();
    flushOl();
    flushTable();
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();

    // Fenced code blocks ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const blockContent = codeBlockLines.join('\n');
        codeBlockLines = [];
        elements.push(
          <pre
            key={`code-${idx}`}
            className="my-2 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed"
          >
            {blockContent}
          </pre>
        );
      } else {
        flushAll();
        inCodeBlock = true;
        codeBlockLines = [];
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      return;
    }

    // Empty line -> close bullet lists and tables, but keep ordered lists cohesive if next line continues numbering
    if (!trimmed) {
      flushUl();
      flushTable();
      return;
    }

    // Horizontal rule (---, ***, ___)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      elements.push(<hr key={`hr-${idx}`} className="my-2.5 border-slate-200" />);
      return;
    }

    // Markdown Table row (| Col 1 | Col 2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      flushUl();
      flushOl();
      // Skip separator row like |---|---|
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        return;
      }
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());
      if (!currentTable) {
        currentTable = [cells];
      } else {
        currentTable.push(cells);
      }
      return;
    } else if (currentTable) {
      flushTable();
    }

    // Headings (# to ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s*(.+)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();

      if (level === 1) {
        elements.push(
          <h2
            key={`h1-${idx}`}
            className="text-sm sm:text-base font-bold text-slate-900 mt-3.5 mb-1.5 pb-1 border-b border-slate-200 tracking-tight"
          >
            {renderInlineMarkdown(headingText, `h1-${idx}`)}
          </h2>
        );
      } else if (level === 2) {
        elements.push(
          <h3
            key={`h2-${idx}`}
            className="text-xs sm:text-sm font-bold text-slate-900 mt-3 mb-1.5 tracking-tight flex items-center gap-1.5"
          >
            {renderInlineMarkdown(headingText, `h2-${idx}`)}
          </h3>
        );
      } else {
        elements.push(
          <h4
            key={`h3-${idx}`}
            className="text-xs font-bold text-teal-950 uppercase tracking-wide mt-3 mb-1.5 bg-teal-50/80 border-l-3 border-teal-600 px-2.5 py-1 rounded-r-md"
          >
            {renderInlineMarkdown(headingText, `h3-${idx}`)}
          </h4>
        );
      }
      return;
    }

    // Unordered Bullet List Items (•, -, *, +, –) — supports indentation
    const bulletMatch = rawLine.match(/^(\s*)([•\-*+–])\s+(.*)$/);
    if (bulletMatch) {
      flushOl();
      const leadingSpaces = bulletMatch[1].length;
      const itemText = bulletMatch[3].trim();
      if (!currentUl) {
        currentUl = [{ text: itemText, indent: leadingSpaces >= 2 }];
      } else {
        currentUl.push({ text: itemText, indent: leadingSpaces >= 2 });
      }
      return;
    }

    // Ordered Numbered List Items (1. or 1) )
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numberedMatch) {
      flushUl();
      const num = numberedMatch[1];
      const itemText = numberedMatch[2].trim();
      if (!currentOl) {
        currentOl = [{ num, text: itemText }];
      } else {
        currentOl.push({ num, text: itemText });
      }
      return;
    }

    // Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      flushAll();
      const quoteText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote
          key={`quote-${idx}`}
          className="border-l-3 border-teal-500 pl-3 py-1.5 my-2 text-xs italic text-slate-700 bg-teal-50/40 rounded-r-lg"
        >
          {renderInlineMarkdown(quoteText, `q-${idx}`)}
        </blockquote>
      );
      return;
    }

    // Normal paragraph line
    flushAll();
    elements.push(
      <p key={`p-${idx}`} className="my-1.5 text-xs text-slate-800 leading-relaxed">
        {renderInlineMarkdown(trimmed, `p-${idx}`)}
      </p>
    );
  });

  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre
        key="code-eof"
        className="my-2 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed"
      >
        {codeBlockLines.join('\n')}
      </pre>
    );
  }

  flushAll();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
