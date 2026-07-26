import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const pipelineRunsTable = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  grade: integer("grade").notNull(),
  topic: text("topic").notNull(),
  generatorOutput: jsonb("generator_output").notNull(),
  reviewerOutput: jsonb("reviewer_output").notNull(),
  refinedOutput: jsonb("refined_output"),
  refinementApplied: boolean("refinement_applied").notNull().default(false),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PipelineRun = typeof pipelineRunsTable.$inferSelect;
export type InsertPipelineRun = typeof pipelineRunsTable.$inferInsert;
