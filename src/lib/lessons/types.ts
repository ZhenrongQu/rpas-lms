import { z } from "zod";
import type { ModuleId } from "../content/types";

export const FrontmatterSchema = z.object({
  title: z.string().min(1),
  order: z.number().int().min(1),
  estMinutes: z.number().int().min(1),
  certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
  access: z.enum(["FREE", "PAID"]),
});

export type Course = "basic" | "advanced";

export interface LessonMeta {
  lessonId: string; // `${course}/${moduleId}/${slug}`
  course: Course;
  moduleId: string;
  slug: string;
  title: string;
  order: number;
  estMinutes: number;
  certLevel: "BASIC" | "ADVANCED" | "BOTH";
  access: "FREE" | "PAID";
  videoUid: string | null;
  videoStatus: string | null;
  videoDurationSec: number | null;
  videoThumbnailUrl: string | null;
}

export type RouteLocale = "en" | "zh";
export type { ModuleId };
