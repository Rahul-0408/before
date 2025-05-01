import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PentestGPTContext } from '@/context/context';
import { deleteChat } from '@/db/chats';
import type { Tables } from '@/supabase/types';
import type { ContentType, DataItemType } from '@/types';
import { type FC, useContext, useRef, useState } from 'react';

interface SidebarDeleteItemProps {
  item: DataItemType;
  contentType: ContentType;
}

export const SidebarDeleteItem: FC<SidebarDeleteItemProps> = ({
  item,
  contentType,
}) => {
  const { setChats } = useContext(PentestGPTContext);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showDialog, setShowDialog] = useState(false);

  const deleteFunctions = {
    chats: async (chat: Tables<'chats'>) => {
      await deleteChat(chat.id);
    },
  };

  const stateUpdateFunctions = {
    chats: setChats,
  };

  const handleDelete = async () => {
    const deleteFunction = deleteFunctions[contentType];
    const setStateFunction = stateUpdateFunctions[contentType];

    if (!deleteFunction || !setStateFunction) return;

    await deleteFunction(item as any);

    setStateFunction((prevItems: any) =>
      prevItems.filter((prevItem: any) => prevItem.id !== item.id),
    );

    setShowDialog(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      buttonRef.current?.click();
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        <Button className="text-red-500" variant="ghost">
          Delete
        </Button>
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Delete {contentType.slice(0, -1)}</DialogTitle>

          <DialogDescription>
            Are you sure you want to delete {item.name}?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowDialog(false)}>
            Cancel
          </Button>

          <Button ref={buttonRef} variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
