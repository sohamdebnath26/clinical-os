import React from 'react';

interface WhatsAppMessageRendererProps {
  text: string;
  className?: string;
  timeString?: string;
}

/**
 * Tokenizer & Parser for WhatsApp formatting:
 * - *bold* -> <strong>
 * - _italic_ -> <em>
 * - ~strikethrough~ -> <del>
 * - ```code``` -> <code>
 * - Preserves emojis with proper font stack
 * - Formats horizontal divider lines
 */
function parseInlineWhatsAppFormatting(line: string, keyPrefix: string): React.ReactNode[] {
  // Regex to match WhatsApp formatting tags:
  // 1: ```code```
  // 2: *bold* (requires non-space immediately inside asterisks)
  // 3: _italic_ (requires non-space immediately inside underscores)
  // 4: ~strike~ (requires non-space immediately inside tildes)
  const regex = /(```[\s\S]*?```|\*[^\s*](?:[^*]*?[^\s*])?\*|_[^\s_](?:[^_]*?[^\s_])?_|~[^\s~](?:[^~]*?[^\s~])?~)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Plain text before the match
    if (match.index > lastIndex) {
      parts.push(line.substring(lastIndex, match.index));
    }

    const token = match[0];
    const itemKey = `${keyPrefix}_${match.index}`;

    if (token.startsWith('```') && token.endsWith('```')) {
      const codeContent = token.slice(3, -3);
      parts.push(
        <code
          key={itemKey}
          className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono text-[11px] border border-slate-200"
        >
          {codeContent}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const boldContent = token.slice(1, -1);
      // Recursively parse any nested italics inside bold
      parts.push(
        <strong key={itemKey} className="font-bold text-slate-900 tracking-tight">
          {parseInlineWhatsAppFormatting(boldContent, `${itemKey}_nested`)}
        </strong>
      );
    } else if (token.startsWith('_') && token.endsWith('_')) {
      const italicContent = token.slice(1, -1);
      // Recursively parse any nested bold inside italics
      parts.push(
        <em key={itemKey} className="italic text-slate-700">
          {parseInlineWhatsAppFormatting(italicContent, `${itemKey}_nested`)}
        </em>
      );
    } else if (token.startsWith('~') && token.endsWith('~')) {
      const strikeContent = token.slice(1, -1);
      parts.push(
        <del key={itemKey} className="line-through text-slate-400">
          {parseInlineWhatsAppFormatting(strikeContent, `${itemKey}_nested`)}
        </del>
      );
    } else {
      parts.push(token);
    }

    lastIndex = regex.lastIndex;
  }

  // Any remaining plain text on this line
  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  return parts;
}

export const WhatsAppMessageRenderer: React.FC<WhatsAppMessageRendererProps> = ({
  text,
  className = '',
  timeString
}) => {
  if (!text) {
    return (
      <div className="text-slate-400 italic text-xs p-4 text-center">
        No message content to preview
      </div>
    );
  }

  const lines = text.split('\n');
  const displayTime = timeString || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`space-y-1 font-sans text-[13px] leading-relaxed text-[#111b21] selection:bg-[#25D366]/20 ${className}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) {
          return <div key={idx} className="h-2" />;
        }

        // Horizontal divider (e.g. ━━━━━━━━━━━━━━━━━━━━━ or -----------)
        if (/^[━─—\-=]{5,}$/.test(trimmed)) {
          return (
            <div key={idx} className="my-2 border-t border-[#d1d7db]/80" />
          );
        }

        // Render line with inline WhatsApp formatting (bold, italic, strike, code, emoji)
        return (
          <div key={idx} className="break-words">
            {parseInlineWhatsAppFormatting(line, `l_${idx}`)}
          </div>
        );
      })}

      {/* WhatsApp Message Metadata Footer (Time & Blue Double-Ticks) */}
      <div className="flex items-center justify-end gap-1 pt-1.5 select-none text-[10px] text-[#667781] float-right clear-both">
        <span>{displayTime}</span>
        {/* Double Checkmark (Read Receipt in WhatsApp Blue) */}
        <span className="text-[#53bdeb] flex items-center font-bold" title="Delivered & Read">
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 16 15">
            <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
          </svg>
        </span>
      </div>
      <div className="clear-both" />
    </div>
  );
};
