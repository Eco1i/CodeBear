import { Fragment } from "react";

interface HighlightedTextProps {
  text: string;
  query: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
  const keyword = query.trim();
  if (!text || !keyword) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(keyword)})`, "gi"));
  const normalizedKeyword = keyword.toLocaleLowerCase();

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {part.toLocaleLowerCase() === normalizedKeyword ? (
            <mark className="search-highlight">{part}</mark>
          ) : (
            part
          )}
        </Fragment>
      ))}
    </>
  );
}
