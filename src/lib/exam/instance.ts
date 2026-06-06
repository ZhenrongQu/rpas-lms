import { ExamService } from "./service";
import { InMemorySessionStore } from "./store";

// Single in-process service instance, cached on globalThis so Server Components,
// Route Handlers, and HMR reloads in Next.js dev all share ONE in-memory store.
// (Without this, RSC and route handlers can get separate module instances and a
// session created via POST /api/exam is invisible to the exam page.) Replaced by
// a Prisma-backed store in Plan 3.
const globalForExam = globalThis as unknown as { examService?: ExamService };

export const examService =
  globalForExam.examService ?? new ExamService(new InMemorySessionStore());

if (!globalForExam.examService) globalForExam.examService = examService;
