/**
 * AI Educational Content Pipeline — Agent Logic
 *
 * Implements two agents using OpenAI gpt-4o:
 *   1. Generator Agent — creates grade-appropriate educational content
 *   2. Reviewer Agent — evaluates the content for appropriateness and accuracy
 *
 * Refinement logic: if Reviewer returns "fail", Generator is re-run once
 * with the feedback embedded in the prompt context.
 */

import OpenAI from "openai";
import { logger } from "./logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MCQOption {
  label: string;
  text: string;
}

export interface MCQ {
  question: string;
  options: MCQOption[];
  answer: string;
}

export interface GeneratorOutput {
  explanation: string;
  mcqs: MCQ[];
}

export interface ReviewerOutput {
  status: "pass" | "fail";
  feedback: string[];
}

export interface PipelineResult {
  generatorOutput: GeneratorOutput;
  reviewerOutput: ReviewerOutput;
  refinedOutput: GeneratorOutput | null;
  refinementApplied: boolean;
}

// ── OpenAI client ──────────────────────────────────────────────────────────

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
}

// ── Generator Agent ────────────────────────────────────────────────────────

const GENERATOR_SYSTEM_PROMPT = `You are an expert educational content creator specializing in creating age-appropriate curriculum materials.
Your role is to generate clear, accurate, and engaging educational content tailored to a specific grade level.

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.
The JSON must exactly match this structure:
{
  "explanation": "<grade-appropriate explanation of the topic, 3-5 paragraphs>",
  "mcqs": [
    {
      "question": "<question text>",
      "options": [
        {"label": "A", "text": "<option text>"},
        {"label": "B", "text": "<option text>"},
        {"label": "C", "text": "<option text>"},
        {"label": "D", "text": "<option text>"}
      ],
      "answer": "<correct label: A, B, C, or D>"
    }
  ]
}

Generate exactly 4 multiple-choice questions. Ensure:
- Language complexity matches the grade level (simple words for lower grades, technical vocabulary for higher grades)
- All concepts in questions are introduced in the explanation
- Distractors (wrong answers) are plausible but clearly incorrect
- Each question tests a different aspect of the topic`;

async function runGeneratorAgent(
  openai: OpenAI,
  grade: number,
  topic: string,
  reviewerFeedback?: string[]
): Promise<GeneratorOutput> {
  const feedbackContext = reviewerFeedback && reviewerFeedback.length > 0
    ? `\n\nIMPORTANT — Reviewer feedback to address in this revision:\n${reviewerFeedback.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nCarefully address every point above.`
    : "";

  const userPrompt = `Generate educational content for Grade ${grade} students on the topic: "${topic}".${feedbackContext}

Ensure the language, concepts, and question difficulty are appropriate for Grade ${grade} students.`;

  logger.info({ grade, topic, hasRefinement: !!reviewerFeedback }, "Running Generator Agent");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      { role: "system", content: GENERATOR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Generator Agent returned empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Generator Agent returned invalid JSON: ${content.slice(0, 200)}`);
  }

  return validateGeneratorOutput(parsed);
}

function validateGeneratorOutput(raw: unknown): GeneratorOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Generator output is not an object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.explanation !== "string" || obj.explanation.trim() === "") {
    throw new Error("Generator output missing valid 'explanation'");
  }

  if (!Array.isArray(obj.mcqs) || obj.mcqs.length === 0) {
    throw new Error("Generator output missing valid 'mcqs' array");
  }

  const mcqs: MCQ[] = obj.mcqs.map((q: unknown, i: number) => {
    if (typeof q !== "object" || q === null) throw new Error(`MCQ ${i} is not an object`);
    const qObj = q as Record<string, unknown>;

    if (typeof qObj.question !== "string") throw new Error(`MCQ ${i} missing 'question'`);
    if (!Array.isArray(qObj.options) || qObj.options.length < 2) throw new Error(`MCQ ${i} missing 'options'`);
    if (typeof qObj.answer !== "string") throw new Error(`MCQ ${i} missing 'answer'`);

    const options: MCQOption[] = qObj.options.map((opt: unknown, j: number) => {
      if (typeof opt !== "object" || opt === null) throw new Error(`MCQ ${i} option ${j} is not an object`);
      const optObj = opt as Record<string, unknown>;
      if (typeof optObj.label !== "string") throw new Error(`MCQ ${i} option ${j} missing 'label'`);
      if (typeof optObj.text !== "string") throw new Error(`MCQ ${i} option ${j} missing 'text'`);
      return { label: optObj.label, text: optObj.text };
    });

    return { question: qObj.question, options, answer: qObj.answer };
  });

  return { explanation: obj.explanation.trim(), mcqs };
}

// ── Reviewer Agent ─────────────────────────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are a strict educational content reviewer with expertise in curriculum development and child development.
Your role is to critically evaluate educational content for quality and grade-appropriateness.

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.
The JSON must exactly match this structure:
{
  "status": "pass" or "fail",
  "feedback": ["specific feedback item 1", "specific feedback item 2"]
}

Evaluation criteria — flag any of these as FAIL:
1. Age appropriateness: vocabulary, sentence length, and concept complexity must match the grade level
2. Conceptual correctness: all facts must be accurate; no scientific or mathematical errors
3. Clarity: explanations must be unambiguous and logically ordered
4. Question quality: MCQ questions must test concepts covered in the explanation; distractors must be plausible
5. Answer correctness: the indicated correct answer must actually be correct

Pass criteria: content is accurate, clear, and grade-appropriate with no significant issues.
Fail criteria: any factual error, significant age-mismatch, major clarity issue, or question/answer mismatch.

Feedback items must be specific (e.g. "Sentence 3 uses 'photosynthesis' without explaining it for Grade 2") not generic.
If status is "pass", feedback array should be empty or contain minor positive notes.`;

async function runReviewerAgent(
  openai: OpenAI,
  grade: number,
  topic: string,
  generatorOutput: GeneratorOutput
): Promise<ReviewerOutput> {
  const userPrompt = `Review this Grade ${grade} educational content on "${topic}":

EXPLANATION:
${generatorOutput.explanation}

MCQ QUESTIONS:
${generatorOutput.mcqs.map((q, i) => `
Q${i + 1}: ${q.question}
${q.options.map(o => `  ${o.label}. ${o.text}`).join("\n")}
Correct answer: ${q.answer}`).join("\n")}

Evaluate carefully for a Grade ${grade} student audience.`;

  logger.info({ grade, topic }, "Running Reviewer Agent");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 800,
    temperature: 0.3,
    messages: [
      { role: "system", content: REVIEWER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Reviewer Agent returned empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Reviewer Agent returned invalid JSON: ${content.slice(0, 200)}`);
  }

  return validateReviewerOutput(parsed);
}

function validateReviewerOutput(raw: unknown): ReviewerOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Reviewer output is not an object");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.status !== "pass" && obj.status !== "fail") {
    throw new Error(`Reviewer output has invalid status: ${String(obj.status)}`);
  }

  const feedback = Array.isArray(obj.feedback)
    ? obj.feedback.filter((f): f is string => typeof f === "string")
    : [];

  return { status: obj.status, feedback };
}

// ── Pipeline Orchestrator ──────────────────────────────────────────────────

/**
 * Run the full agent pipeline:
 *   1. Generator Agent produces initial content
 *   2. Reviewer Agent evaluates it
 *   3. If reviewer fails, Generator runs once more with feedback embedded
 */
export async function runPipeline(grade: number, topic: string): Promise<PipelineResult> {
  const openai = getClient();

  // Step 1: Generate initial content
  const generatorOutput = await runGeneratorAgent(openai, grade, topic);

  // Step 2: Review the generated content
  const reviewerOutput = await runReviewerAgent(openai, grade, topic, generatorOutput);

  // Step 3: Refine if reviewer failed (max 1 pass)
  let refinedOutput: GeneratorOutput | null = null;
  let refinementApplied = false;

  if (reviewerOutput.status === "fail" && reviewerOutput.feedback.length > 0) {
    logger.info({ grade, topic, feedback: reviewerOutput.feedback }, "Reviewer returned fail — running refinement pass");
    refinedOutput = await runGeneratorAgent(openai, grade, topic, reviewerOutput.feedback);
    refinementApplied = true;
  }

  return {
    generatorOutput,
    reviewerOutput,
    refinedOutput,
    refinementApplied,
  };
}
