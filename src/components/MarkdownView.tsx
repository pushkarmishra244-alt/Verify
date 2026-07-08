import React from 'react';

export default function MarkdownView({ content }: { content: string }) {
  if (!content) return null;

  // Split content by lines
  const lines = content.split('\n');

  return (
    <div className="space-y-3 text-slate-700 leading-relaxed text-sm">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Headers
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-sm font-semibold text-slate-900 mt-4 mb-2 font-display uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-3 bg-indigo-500 rounded-sm"></span>
              {trimmed.substring(4)}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1.5 mt-5 mb-2 font-display flex items-center gap-2">
              {trimmed.substring(3)}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-lg font-bold text-slate-900 mt-6 mb-3 font-display">
              {trimmed.substring(2)}
            </h1>
          );
        }

        // List items
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-2 my-1 text-slate-600">
              <span className="text-indigo-500 mt-1.5 text-[6px]">●</span>
              <span className="flex-1">{parseInlineMarkdown(trimmed.substring(2))}</span>
            </div>
          );
        }

        // Ordered lists
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s(.*)/);
          if (match) {
            return (
              <div key={idx} className="flex items-start gap-2 ml-2 my-1 text-slate-600">
                <span className="font-semibold text-indigo-500 text-xs min-w-[14px]">{match[1]}.</span>
                <span className="flex-1">{parseInlineMarkdown(match[2])}</span>
              </div>
            );
          }
        }

        // Code block / markdown block (e.g. ```)
        if (trimmed.startsWith('```')) {
          return null; // Skip raw triple ticks code blocks
        }

        if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
          return (
            <code key={idx} className="block bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs font-mono text-indigo-600 my-1 overflow-x-auto">
              {trimmed.replace(/`/g, '')}
            </code>
          );
        }

        // Blockquotes
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={idx} className="border-l-4 border-indigo-400 bg-indigo-50/30 p-3 rounded-r-lg text-slate-600 italic my-2">
              {parseInlineMarkdown(trimmed.substring(2))}
            </blockquote>
          );
        }

        // Empty line
        if (!trimmed) return <div key={idx} className="h-1.5" />;

        // Standard paragraph
        return (
          <p key={idx} className="text-slate-600 leading-relaxed">
            {parseInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  // Parse bold and code
  const boldParts = text.split(/\*\*/g);
  return boldParts.flatMap((part, i) => {
    if (i % 2 === 1) {
      return [<strong key={`b-${i}`} className="font-semibold text-slate-900">{parseInlineCode(part)}</strong>];
    }
    return [parseInlineCode(part)];
  });
}

function parseInlineCode(text: string): React.ReactNode {
  const codeParts = text.split(/`/g);
  if (codeParts.length === 1) return text;
  
  return codeParts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <code key={`c-${i}`} className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-600">
          {part}
        </code>
      );
    }
    return part;
  });
}
