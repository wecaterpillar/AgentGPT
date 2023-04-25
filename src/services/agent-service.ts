import {
  createModel,
  startGoalPrompt,
  executeTaskPrompt,
  createTasksPrompt,
  analyzeTaskPrompt,
} from "../utils/prompts";
import type { ModelSettings } from "../utils/types";
import { env } from "../env/client.mjs";
import { LLMChain } from "langchain/chains";
import { extractTasks } from "../utils/helpers";
import { Serper } from "./custom-tools/serper";

async function startGoalAgent(modelSettings: ModelSettings, goal: string) {
  const completion = await new LLMChain({
    llm: createModel(modelSettings),
    prompt: startGoalPrompt,
  }).call({
    goal,
  });
  console.log("Completion:" + (completion.text as string));
  return extractTasks(completion.text as string, []);
}

async function analyzeTaskAgent(
  modelSettings: ModelSettings,
  goal: string,
  task: string
) {
  const actions = ["reason", "search"];
  const completion = await new LLMChain({
    llm: createModel(modelSettings),
    prompt: analyzeTaskPrompt,
  }).call({
    goal,
    actions,
    task,
  });

  console.log("Analysis completion:\n", completion.text);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const analysis = JSON.parse(completion.text) as Analysis;
    return analysis;
  } catch (e) {
    console.error("Error parsing analysis", e);
    // Default to reasoning
    return DefaultAnalysis;
  }
}

export type Analysis = {
  action: "reason" | "search";
  arg: string;
};

export const DefaultAnalysis: Analysis = {
  action: "reason",
  arg: "Fallback due to parsing failure",
};

async function executeTaskAgent(
  modelSettings: ModelSettings,
  goal: string,
  task: string,
  analysis: Analysis
) {
  console.log("Execution analysis:", analysis);

  if (analysis.action == "search" && process.env.SERP_API_KEY) {
    return await new Serper()._call(analysis.arg);
  }

  const completion = await new LLMChain({
    llm: createModel(modelSettings),
    prompt: executeTaskPrompt,
  }).call({
    goal,
    task,
  });

  return completion.text as string;
}

async function createTasksAgent(
  modelSettings: ModelSettings,
  goal: string,
  tasks: string[],
  lastTask: string,
  result: string,
  completedTasks: string[] | undefined
) {
  const completion = await new LLMChain({
    llm: createModel(modelSettings),
    prompt: createTasksPrompt,
  }).call({
    goal,
    tasks,
    lastTask,
    result,
  });

  return extractTasks(completion.text as string, completedTasks || []);
}

interface AgentService {
  startGoalAgent: (
    modelSettings: ModelSettings,
    goal: string
  ) => Promise<string[]>;
  analyzeTaskAgent: (
    modelSettings: ModelSettings,
    goal: string,
    task: string
  ) => Promise<Analysis>;
  executeTaskAgent: (
    modelSettings: ModelSettings,
    goal: string,
    task: string,
    analysis: Analysis
  ) => Promise<string>;
  createTasksAgent: (
    modelSettings: ModelSettings,
    goal: string,
    tasks: string[],
    lastTask: string,
    result: string,
    completedTasks: string[] | undefined
  ) => Promise<string[]>;
}

const OpenAIAgentService: AgentService = {
  startGoalAgent: startGoalAgent,
  analyzeTaskAgent: analyzeTaskAgent,
  executeTaskAgent: executeTaskAgent,
  createTasksAgent: createTasksAgent,
};

const MockAgentService: AgentService = {
  startGoalAgent: async (modelSettings, goal) => {
    return await new Promise((resolve) => resolve(["Task 1"]));
  },

  createTasksAgent: async (
    modelSettings: ModelSettings,
    goal: string,
    tasks: string[],
    lastTask: string,
    result: string,
    completedTasks: string[] | undefined
  ) => {
    return await new Promise((resolve) => resolve(["Task 4"]));
  },

  analyzeTaskAgent: async (
    modelSettings: ModelSettings,
    goal: string,
    task: string
  ) => {
    return await new Promise((resolve) => resolve("reason"));
  },

  executeTaskAgent: async (
    modelSettings: ModelSettings,
    goal: string,
    task: string,
    analysis: Analysis
  ) => {
    return await new Promise((resolve) => resolve("Result: " + task));
  },
};

export default env.NEXT_PUBLIC_FF_MOCK_MODE_ENABLED
  ? MockAgentService
  : OpenAIAgentService;
