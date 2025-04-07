import React from 'react';
import { FileContentBlock } from './types';
import { MessageMarkdown } from '../message-markdown';
import { Button } from '@/components/ui/button';
import { IconChevronDown, IconChevronUp, IconFile } from '@tabler/icons-react';
import { CopyButton } from '../message-codeblock';
import { MAX_VISIBLE_LINES } from './types';
import { ShowMoreButton } from './show-more-button';

interface FileContentBlockComponentProps {
  block: FileContentBlock;
  index: number;
  isClosed: boolean;
  onToggleBlock: (index: number) => void;
}

export const FileContentBlockComponent: React.FC<
  FileContentBlockComponentProps
> = ({ block, index, isClosed, onToggleBlock }) => {
  const lines = block.content.split('\n');
  const shouldShowMore = lines.length > MAX_VISIBLE_LINES;
  const displayedContent = shouldShowMore
    ? lines.slice(0, MAX_VISIBLE_LINES).join('\n')
    : block.content;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-border ${index === 1 ? 'mb-3' : 'my-3'}`}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2">
        <div className="flex items-center flex-1 min-w-0">
          <div className="flex items-center shrink-0 mr-2">
            <IconFile size={16} className="mr-2" />
            <span>Reading file</span>
          </div>
          <div className="min-w-0 flex-1">
            <code className="truncate block font-mono text-muted-foreground text-sm">
              {block.path}
            </code>
          </div>
        </div>
        <div className="flex items-center ml-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onToggleBlock(index)}
            aria-expanded={!isClosed}
            aria-controls={`file-content-${index}`}
          >
            {isClosed ? (
              <IconChevronDown size={18} />
            ) : (
              <IconChevronUp size={18} />
            )}
          </Button>
        </div>
      </div>
      {!isClosed && (
        <div
          id={`file-content-${index}`}
          className="bg-foreground dark:bg-background"
        >
          <div className="font-mono text-foreground/80">
            <MessageMarkdown
              content={`\`\`\`\n${displayedContent}\n\`\`\``}
              isAssistant={true}
            />
            {shouldShowMore && (
              <ShowMoreButton
                isExpanded={false}
                onClick={() => {}}
                remainingLines={lines.length - MAX_VISIBLE_LINES}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
