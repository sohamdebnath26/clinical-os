import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

// Parses inline tokens: **bold**, *italic*, `code`
function renderInline(text: string): React.ReactNode[] {
  // Regex matches:
  // 1. ***bold & italic***
  // 2. **bold**
  // 3. *italic*
  // 4. `code`
  const regex = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
      return (
        <strong key={index} className="font-bold italic text-slate-900">
          {part.slice(3, -3)}
        </strong>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={index} className="italic text-slate-600">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={index}
          className="font-mono text-[11px] bg-slate-200/70 text-teal-900 px-1.5 py-0.5 rounded"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-1">
            {currentList.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                <span className="flex-1">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-1 list-decimal list-inside">
            {currentList.items.map((item, i) => (
              <li key={i} className="text-slate-700 leading-relaxed">
                <span>{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();

    // Empty line -> separate block
    if (!line) {
      flushList();
      return;
    }

    // Heading 1 (# ...)
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h2
          key={`h1-${idx}`}
          className="text-base font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200 tracking-tight"
        >
          {renderInline(line.slice(2))}
        </h2>
      );
      return;
    }

    // Heading 2 (## ...)
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3
          key={`h2-${idx}`}
          className="text-sm font-bold text-slate-900 mt-3 mb-1.5 tracking-tight flex items-center gap-1.5"
        >
          {renderInline(line.slice(3))}
        </h3>
      );
      return;
    }

    // Heading 3 (### ...)
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h4
          key={`h3-${idx}`}
          className="text-xs font-bold text-teal-950 uppercase tracking-wide mt-3 mb-1.5 bg-teal-50/70 border-l-3 border-teal-600 px-2.5 py-1 rounded-r-md"
        >
          {renderInline(line.slice(4))}
        </h4>
      );
      return;
    }

    // Bullet list items (•, -, *)
    if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
      const itemText = line.slice(2).trim();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      return;
    }

    // Numbered list items (1. 2. etc)
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      const itemText = numberedMatch[2];
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      return;
    }

    // Blockquote (> ...)
    if (line.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote
          key={`quote-${idx}`}
          className="border-l-3 border-teal-500 pl-3 py-1 my-2 text-xs italic text-slate-600 bg-slate-100/60 rounded-r-md"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      return;
    }

    // Normal paragraph line
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="my-1.5 text-xs text-slate-800 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });

  flushList();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
