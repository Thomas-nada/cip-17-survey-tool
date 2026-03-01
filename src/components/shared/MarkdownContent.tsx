import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-semibold text-white mt-3 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-white mt-3 mb-2">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-slate-200 leading-relaxed mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 text-sm text-slate-200">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 text-sm text-slate-200">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          code: ({ children, className: codeClass }) => (
            <code className={`font-code text-xs bg-slate-900/60 rounded px-1 py-0.5 ${codeClass ?? ''}`.trim()}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-code text-xs bg-slate-900/70 border border-slate-700/40 rounded-lg p-3 overflow-x-auto mb-2">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-teal-500/40 pl-3 italic text-slate-300 mb-2">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:text-teal-200 underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
