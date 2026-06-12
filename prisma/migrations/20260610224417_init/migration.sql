-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "hashedPassword" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userNumber" INTEGER,
    "username" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "hashedPassword" TEXT,
    "accessTier" TEXT NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "certLevel" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "questionIds" TEXT NOT NULL,
    "questionSnapshot" TEXT NOT NULL DEFAULT '[]',
    "answers" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeCustomerId" TEXT,
    "product" TEXT NOT NULL,
    "amountTotal" INTEGER,
    "currency" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicQuestionBank" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "certLevel" TEXT NOT NULL DEFAULT 'BASIC',
    "type" TEXT NOT NULL,
    "selectCount" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,
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

    CONSTRAINT "BasicQuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedQuestionBank" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "certLevel" TEXT NOT NULL DEFAULT 'ADVANCED',
    "type" TEXT NOT NULL,
    "selectCount" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,
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

    CONSTRAINT "AdvancedQuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "labelEN" TEXT NOT NULL,
    "labelZH" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "BasicQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "labelEN" TEXT NOT NULL,
    "labelZH" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "AdvancedQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicLesson" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT 'basic',
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "estMinutes" INTEGER NOT NULL,
    "certLevel" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "titleEN" TEXT NOT NULL,
    "titleZH" TEXT NOT NULL,
    "bodyEN" TEXT NOT NULL,
    "bodyZH" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasicLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedLesson" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT 'advanced',
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "estMinutes" INTEGER NOT NULL,
    "certLevel" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "titleEN" TEXT NOT NULL,
    "titleZH" TEXT NOT NULL,
    "bodyEN" TEXT NOT NULL,
    "bodyZH" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvancedLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicLessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BasicLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedLessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvancedLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userNumber_key" ON "Customer"("userNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_username_key" ON "Customer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerAccountId_key" ON "UserIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "VerificationCode_target_channel_idx" ON "VerificationCode"("target", "channel");

-- CreateIndex
CREATE INDEX "ExamSession_userId_idx" ON "ExamSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_product_idx" ON "Payment"("product");

-- CreateIndex
CREATE INDEX "Entitlement_userId_idx" ON "Entitlement"("userId");

-- CreateIndex
CREATE INDEX "Entitlement_product_idx" ON "Entitlement"("product");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_userId_product_key" ON "Entitlement"("userId", "product");

-- CreateIndex
CREATE INDEX "BasicQuestionBank_moduleId_idx" ON "BasicQuestionBank"("moduleId");

-- CreateIndex
CREATE INDEX "AdvancedQuestionBank_moduleId_idx" ON "AdvancedQuestionBank"("moduleId");

-- CreateIndex
CREATE INDEX "BasicQuestionOption_questionId_idx" ON "BasicQuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "BasicQuestionOption_questionId_optionId_key" ON "BasicQuestionOption"("questionId", "optionId");

-- CreateIndex
CREATE INDEX "AdvancedQuestionOption_questionId_idx" ON "AdvancedQuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancedQuestionOption_questionId_optionId_key" ON "AdvancedQuestionOption"("questionId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "BasicLesson_lessonId_key" ON "BasicLesson"("lessonId");

-- CreateIndex
CREATE INDEX "BasicLesson_course_moduleId_idx" ON "BasicLesson"("course", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "BasicLesson_course_moduleId_slug_key" ON "BasicLesson"("course", "moduleId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancedLesson_lessonId_key" ON "AdvancedLesson"("lessonId");

-- CreateIndex
CREATE INDEX "AdvancedLesson_course_moduleId_idx" ON "AdvancedLesson"("course", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancedLesson_course_moduleId_slug_key" ON "AdvancedLesson"("course", "moduleId", "slug");

-- CreateIndex
CREATE INDEX "BasicLessonProgress_userId_idx" ON "BasicLessonProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BasicLessonProgress_userId_lessonId_key" ON "BasicLessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AdvancedLessonProgress_userId_idx" ON "AdvancedLessonProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancedLessonProgress_userId_lessonId_key" ON "AdvancedLessonProgress"("userId", "lessonId");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicQuestionOption" ADD CONSTRAINT "BasicQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "BasicQuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancedQuestionOption" ADD CONSTRAINT "AdvancedQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AdvancedQuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicLessonProgress" ADD CONSTRAINT "BasicLessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasicLessonProgress" ADD CONSTRAINT "BasicLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "BasicLesson"("lessonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancedLessonProgress" ADD CONSTRAINT "AdvancedLessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancedLessonProgress" ADD CONSTRAINT "AdvancedLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "AdvancedLesson"("lessonId") ON DELETE CASCADE ON UPDATE CASCADE;

