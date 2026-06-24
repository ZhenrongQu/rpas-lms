import { ExamService } from "./service";
import { PrismaSessionStore } from "./prismaStore";

// Single in-process service instance, cached on globalThis so Server Components,
// Route Handlers, and HMR reloads share ONE service. The store is Postgres-backed
// (PrismaSessionStore), so sessions survive a server restart.
const globalForExam = globalThis as unknown as { examService?: ExamService };

export const examService =
  globalForExam.examService ?? new ExamService(new PrismaSessionStore());

if (!globalForExam.examService) globalForExam.examService = examService;
