import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Category
  const category = await prisma.examCategory.create({
    data: {
      name: "SSC",
      slug: "ssc",
      description: "Staff Selection Commission exams",
    },
  });

  // 2. Exam
  const exam = await prisma.exam.create({
    data: {
      categoryId: category.id,
      title: "SSC CGL Mock Test 1",
      slug: "ssc-cgl-mock-1",
      description: "Full-length mock test for SSC CGL Tier 1",
      totalDurationMin: 60,
      totalMarks: 100,
      negativeMarking: 0.25,
      isFree: true,
      isPublished: true,
    },
  });

  // 3. Section
  const section = await prisma.section.create({
    data: {
      examId: exam.id,
      name: "Quantitative Aptitude",
      orderIndex: 1,
      totalMarks: 100,
    },
  });

  // 4. Question with options
  await prisma.question.create({
    data: {
      sectionId: section.id,
      questionType: "mcq_single",
      questionText: "What is 15% of 200?",
      marks: 1,
      negativeMarks: 0.25,
      difficulty: "easy",
      tags: ["percentage"],
      options: {
        create: [
          { optionText: "20", isCorrect: false, orderIndex: 1 },
          { optionText: "25", isCorrect: false, orderIndex: 2 },
          { optionText: "30", isCorrect: true, orderIndex: 3 },
          { optionText: "35", isCorrect: false, orderIndex: 4 },
        ],
      },
    },
  });

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
