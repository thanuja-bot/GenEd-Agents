import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pipelineRunsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  RunPipelineBody,
  ListPipelineRunsQueryParams,
  GetPipelineRunParams,
} from "@workspace/api-zod";
import { runPipeline } from "../lib/agents";
import OpenAI from "openai";

const router: IRouter = Router();

/**
 * POST /api/pipeline/run
 * Runs the full Generator → Reviewer → (optional Refinement) pipeline
 */
router.post("/pipeline/run", async (req, res): Promise<void> => {
  const parsed = RunPipelineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { grade, topic } = parsed.data;
  const startTime = Date.now();

  req.log.info({ grade, topic }, "Starting pipeline run");

  let result;
  try {
    result = await runPipeline(grade, topic);
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? 500;
      let message = err.message;
      if (status === 429) {
        message = "OpenAI quota exceeded. Please check your API key's billing and usage limits at platform.openai.com.";
      } else if (status === 401) {
        message = "Invalid OpenAI API key. Please verify your OPENAI_API_KEY environment variable.";
      }
      req.log.warn({ status, openaiError: err.message }, "OpenAI API error during pipeline run");
      res.status(status).json({ error: message });
      return;
    }
    throw err; // let Express handle unexpected errors
  }

  const durationMs = Date.now() - startTime;

  const [inserted] = await db
    .insert(pipelineRunsTable)
    .values({
      grade,
      topic,
      generatorOutput: result.generatorOutput,
      reviewerOutput: result.reviewerOutput,
      refinedOutput: result.refinedOutput,
      refinementApplied: result.refinementApplied,
      durationMs,
    })
    .returning();

  req.log.info({ id: inserted.id, durationMs, reviewStatus: result.reviewerOutput.status }, "Pipeline run complete");

  res.json({
    id: inserted.id,
    grade: inserted.grade,
    topic: inserted.topic,
    generatorOutput: inserted.generatorOutput,
    reviewerOutput: inserted.reviewerOutput,
    refinedOutput: inserted.refinedOutput ?? null,
    refinementApplied: inserted.refinementApplied,
    durationMs: inserted.durationMs ?? null,
    createdAt: inserted.createdAt.toISOString(),
  });
});

/**
 * GET /api/pipeline/runs
 * Returns recent pipeline runs (most recent first)
 */
router.get("/pipeline/runs", async (req, res): Promise<void> => {
  const parsed = ListPipelineRunsQueryParams.safeParse(req.query);
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 20;

  const runs = await db
    .select({
      id: pipelineRunsTable.id,
      grade: pipelineRunsTable.grade,
      topic: pipelineRunsTable.topic,
      reviewerOutput: pipelineRunsTable.reviewerOutput,
      refinementApplied: pipelineRunsTable.refinementApplied,
      durationMs: pipelineRunsTable.durationMs,
      createdAt: pipelineRunsTable.createdAt,
    })
    .from(pipelineRunsTable)
    .orderBy(desc(pipelineRunsTable.createdAt))
    .limit(limit);

  res.json(
    runs.map((r) => ({
      id: r.id,
      grade: r.grade,
      topic: r.topic,
      reviewStatus: (r.reviewerOutput as { status: string }).status,
      refinementApplied: r.refinementApplied,
      durationMs: r.durationMs ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

/**
 * GET /api/pipeline/runs/:id
 * Returns full details of a specific pipeline run
 */
router.get("/pipeline/runs/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = GetPipelineRunParams.safeParse({ id: parseInt(raw, 10) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }

  const [run] = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.id, parsed.data.id));

  if (!run) {
    res.status(404).json({ error: "Pipeline run not found" });
    return;
  }

  res.json({
    id: run.id,
    grade: run.grade,
    topic: run.topic,
    generatorOutput: run.generatorOutput,
    reviewerOutput: run.reviewerOutput,
    refinedOutput: run.refinedOutput ?? null,
    refinementApplied: run.refinementApplied,
    durationMs: run.durationMs ?? null,
    createdAt: run.createdAt.toISOString(),
  });
});

export default router;
