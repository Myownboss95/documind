import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDER, type ChatMessage, type LLMProvider } from '../llm/provider.interface';
import { RetrievalService } from '../rag/retrieval.service';

interface Tool {
  name: string;
  description: string;
  run(input: string): Promise<string>;
}
export interface TraceStep {
  step: number;
  llm: string;
  action?: string;
  input?: string;
  observation?: string;
}
export interface AgentResult {
  answer: string;
  steps: number;
  trace: TraceStep[];
}

/**
 * REACT AGENT  (Stage 6f)
 * -----------------------
 * A reason → act → observe loop. Each turn the LLM emits either an Action (call a
 * tool) or a Final Answer. We run the tool, feed the result back as an Observation,
 * and repeat until Final or a step cap.
 *
 * TWO REAL TOOLS:
 *  - search_documents : queries our RAG retrieval (the "DB query" tool).
 *  - web_search       : offline stub (canned); real fetch in live mode.
 *
 * ROBUSTNESS (what interviewers probe): the loop must survive the model
 * misbehaving. We handle (a) an unknown tool name, (b) a tool that THROWS, and
 * (c) MALFORMED output with no parseable Action/Final — each becomes an error
 * Observation the agent can recover from, never an unhandled crash. A step cap
 * prevents infinite loops.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger('Agent');
  private readonly maxSteps = 5;
  private readonly tools: Tool[];

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LLMProvider,
    private readonly retrieval: RetrievalService,
  ) {
    this.tools = [
      {
        name: 'search_documents',
        description: 'Search the document knowledge base. Input: a search query.',
        run: async (input) => {
          const hits = await this.retrieval.hybridSearch(input, 3);
          if (hits.length === 0) return 'No matching documents.';
          return hits.map((h, i) => `(${i + 1}) ${h.content.slice(0, 160)}`).join(' | ');
        },
      },
      {
        name: 'web_search',
        description: 'Search the public web. Input: a search query.',
        run: async (input) => {
          // Offline stub. In live mode, call a real search API here.
          return `web results for "${input}": [stub] no live web in offline mode.`;
        },
      },
    ];
  }

  async run(question: string): Promise<AgentResult> {
    const toolList = this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
    const system =
      'You are a ReAct agent. Answer the question using tools when helpful.\n' +
      `Available tools:\n${toolList}\n\n` +
      'Each turn, respond in EXACTLY one of these forms:\n' +
      'Thought: <reasoning>\nAction: <tool name>\nAction Input: <input>\n' +
      'OR, when you can answer:\nFinal Answer: <answer>';

    const messages: ChatMessage[] = [{ role: 'user', content: `Question: ${question}` }];
    const trace: TraceStep[] = [];

    for (let step = 1; step <= this.maxSteps; step++) {
      const out = await this.llm.generate({ system, messages });
      const entry: TraceStep = { step, llm: out };

      const finalMatch = out.match(/Final Answer:\s*([\s\S]*)/);
      if (finalMatch) {
        trace.push(entry);
        return { answer: finalMatch[1].trim(), steps: step, trace };
      }

      const action = out.match(/Action:\s*([\w-]+)/)?.[1];
      const input = out.match(/Action Input:\s*(.*)/)?.[1]?.trim() ?? '';
      entry.action = action;
      entry.input = input;

      let observation: string;
      if (!action) {
        // (c) malformed: no Action and no Final Answer.
        observation = 'Error: could not parse an Action or Final Answer. Use the required format.';
      } else {
        const tool = this.tools.find((t) => t.name === action);
        if (!tool) {
          // (a) unknown tool.
          observation = `Error: no tool named "${action}". Valid tools: ${this.tools
            .map((t) => t.name)
            .join(', ')}.`;
        } else {
          try {
            observation = await tool.run(input);
          } catch (err) {
            // (b) tool threw.
            observation = `Error running ${action}: ${err instanceof Error ? err.message : 'unknown'}`;
          }
        }
      }
      entry.observation = observation;
      trace.push(entry);

      messages.push({ role: 'assistant', content: out });
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    }

    return { answer: '(stopped: max steps reached without a Final Answer)', steps: this.maxSteps, trace };
  }
}
