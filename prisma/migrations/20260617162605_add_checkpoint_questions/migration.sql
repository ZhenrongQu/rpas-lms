-- CreateTable
CREATE TABLE "CheckpointQuestion" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "selectCount" INTEGER NOT NULL,
    "stemEN" TEXT NOT NULL,
    "stemZH" TEXT NOT NULL,
    "explEN" TEXT NOT NULL,
    "explZH" TEXT NOT NULL,
    "refEN" TEXT NOT NULL,
    "refZH" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "mediaKind" TEXT,
    "mediaUrl" TEXT,
    "mediaAltEN" TEXT,
    "mediaAltZH" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckpointQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "labelEN" TEXT NOT NULL,
    "labelZH" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "CheckpointQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckpointQuestion_lessonId_idx" ON "CheckpointQuestion"("lessonId");

-- CreateIndex
CREATE INDEX "CheckpointQuestion_course_moduleId_idx" ON "CheckpointQuestion"("course", "moduleId");

-- CreateIndex
CREATE INDEX "CheckpointQuestionOption_questionId_idx" ON "CheckpointQuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckpointQuestionOption_questionId_optionId_key" ON "CheckpointQuestionOption"("questionId", "optionId");

-- AddForeignKey
ALTER TABLE "CheckpointQuestionOption" ADD CONSTRAINT "CheckpointQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CheckpointQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

