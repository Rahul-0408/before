import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';
import { executeTerminalCommand } from '@/lib/tools/e2b/terminal-executor';
import { streamTerminalOutput } from '@/lib/ai/terminal-utils';
import PostHogClient from '@/app/posthog';

/**
 * Creates a terminal tool for executing commands in the sandbox environment
 * @param context - The context needed for tool execution
 * @returns The terminal tool
 */
export const createShellExecTool = (context: ToolContext) => {
  const { dataStream, userID, sandboxManager } = context;

  return tool({
    description:
      'Execute commands in the sandbox environment. Use for running code, installing packages, or managing files.',
    parameters: z.object({
      exec_dir: z
        .string()
        .describe(
          'Working directory for command execution (must use absolute path)',
        ),
      command: z.string().describe('Shell command to execute'),
    }),
    execute: async (args) => {
      const { exec_dir, command } = args as {
        exec_dir: string;
        command: string;
      };

      if (!sandboxManager) {
        throw new Error('Sandbox manager not initialized');
      }

      // Get sandbox from manager
      const { sandbox, persistentSandbox } = await sandboxManager.getSandbox();

      const posthog = PostHogClient();
      if (posthog) {
        posthog.capture({
          distinctId: userID,
          event: 'terminal_executed',
          properties: {
            command: command,
            persistentSandbox: persistentSandbox,
          },
        });
      }

      dataStream.writeData({
        type: 'agent-status',
        content: 'terminal',
      });

      dataStream.writeData({
        type: 'text-delta',
        content: `<terminal-command exec-dir="${exec_dir}">${command}</terminal-command>`,
      });

      // Execute command
      const terminalStream = await executeTerminalCommand({
        userID,
        command,
        exec_dir,
        sandbox,
        dataStream,
      });

      const terminalOutput = await streamTerminalOutput(
        terminalStream,
        dataStream,
      );
      return terminalOutput;
    },
  });
};
