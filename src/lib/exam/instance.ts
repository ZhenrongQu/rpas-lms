import { ExamService } from "./service";
import { InMemorySessionStore } from "./store";

// Single in-process service instance. Replaced by a Prisma-backed store in Plan 3.
export const examService = new ExamService(new InMemorySessionStore());
