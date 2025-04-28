import { processDocX } from '@/lib/retrieval/processing';
import { getServerProfile } from '@/lib/server/server-chat-helpers';
import { createSupabaseAdminClient } from '@/lib/server/server-utils';
import type { FileItemChunk } from '@/types';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const json = await req.json();
  const { text, fileId, fileExtension } = json as {
    text: string;
    fileId: string;
    fileExtension: string;
  };

  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const profile = await getServerProfile();

    let chunks: FileItemChunk[] = [];

    switch (fileExtension) {
      case 'docx':
        chunks = await processDocX(text);
        break;
      default:
        return new NextResponse('Unsupported file type', {
          status: 400,
        });
    }

    const file_items = chunks.map((chunk, index) => ({
      file_id: fileId,
      user_id: profile.user_id,
      sequence_number: index,
      content: chunk.content,
      tokens: chunk.tokens,
      openai_embedding: null,
    }));

    await supabaseAdmin.from('file_items').upsert(file_items);

    const totalTokens = file_items.reduce((acc, item) => acc + item.tokens, 0);

    await supabaseAdmin
      .from('files')
      .update({ tokens: totalTokens })
      .eq('id', fileId);

    return new NextResponse('Embed Successful', {
      status: 200,
    });
  } catch (error: any) {
    console.error(error);
    const errorMessage = error.error?.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
