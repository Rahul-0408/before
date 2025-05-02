'use client';

import React, { useState, useEffect } from 'react';
import type { Tables } from '@/supabase/types';
import { MessageTypeResolver } from '@/components/messages/message-type-solver';
import { bulkFetchImageData } from './chat-helpers';
import Image from 'next/image';

interface SharedMessageProps {
  message: Tables<'messages'>;
  previousMessage: Tables<'messages'> | undefined;
  isLastMessage: boolean;
}

export const SharedMessage: React.FC<SharedMessageProps> = ({
  message,
  previousMessage,
  isLastMessage,
}) => {
  const [imageUrls, setImageUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    const loadImages = async () => {
      if (message.image_paths.length === 0) {
        return;
      }
      const urls = await bulkFetchImageData(message.image_paths);
      setImageUrls(urls);
    };
    loadImages();
  }, [message.image_paths]);

  return (
    <div className="flex w-full justify-center">
      <div className="relative flex w-full flex-col px-0 py-6 sm:w-[550px] sm:px-4 md:w-[650px] xl:w-[800px]">
        <div className="flex space-x-3">
          <div
            className={`min-w-0 grow ${message.role === 'user' ? 'flex justify-end' : ''}`}
          >
            <div>
              <div
                className={`flex flex-wrap ${message.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}
              >
                {imageUrls.map(
                  (url, index) =>
                    url && (
                      <Image
                        key={index}
                        className="mb-2 rounded"
                        src={url}
                        alt={`message image ${index + 1}`}
                        width={400}
                        height={400}
                        loading="lazy"
                      />
                    ),
                )}
              </div>
              <MessageTypeResolver
                message={message}
                isLastMessage={isLastMessage}
                toolInUse="none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
